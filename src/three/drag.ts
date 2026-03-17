import { type Camera, type Object3D, Plane, type Scene, Vector3 } from "three";
import {
	collectMeshesBy,
	getAncestorWith,
	pointer,
	raycaster,
	updatePointer,
} from "./raycast-utils";

const _intersection = new Vector3();
const _offset = new Vector3();

// ─── Tuning constants ───────────────────────────────────────────
const DESK_Y = 0.12;
const FRICTION = 8.0; // velocity decay per second (higher = stops faster)
const RESTITUTION = 0.4; // bounciness on collision (0 = dead stop, 1 = elastic)
const VELOCITY_THRESHOLD = 0.005; // below this, body sleeps
const VELOCITY_SAMPLES = 5; // frames of drag velocity to average on release
const DESK_BOUNDS = { minX: -2.3, maxX: 2.3, minZ: -1.3, maxZ: 1.3 };

// ─── Physics body ───────────────────────────────────────────────
interface PhysicsBody {
	obj: Object3D;
	radius: number;
	mass: number;
	restY: number;
	vx: number;
	vz: number;
	sleeping: boolean;
	isStatic: boolean;
}

const bodies: PhysicsBody[] = [];

export function addStaticObstacle(obj: Object3D, radius = 0.3): void {
	bodies.push({
		obj,
		radius,
		mass: 0, // infinite mass
		restY: obj.position.y,
		vx: 0,
		vz: 0,
		sleeping: true,
		isStatic: true,
	});
}

export function disposePhysics(): void {
	bodies.length = 0;
}

function ensureBody(obj: Object3D, radius = 0.15): PhysicsBody {
	let body = bodies.find((b) => b.obj === obj);
	if (!body) {
		body = {
			obj,
			radius,
			mass: 1,
			restY: obj.position.y,
			vx: 0,
			vz: 0,
			sleeping: true,
			isStatic: false,
		};
		bodies.push(body);
	}
	return body;
}

function clamp(val: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, val));
}

// ─── Collision detection & response ─────────────────────────────
function resolveAllCollisions(): void {
	for (let i = 0; i < bodies.length; i++) {
		for (let j = i + 1; j < bodies.length; j++) {
			const a = bodies[i];
			const b = bodies[j];
			// Skip if both are static or both are sleeping
			if (a.isStatic && b.isStatic) continue;
			if (a.sleeping && b.sleeping) continue;

			const dx = a.obj.position.x - b.obj.position.x;
			const dz = a.obj.position.z - b.obj.position.z;
			const dist = Math.sqrt(dx * dx + dz * dz);
			const minDist = a.radius + b.radius;

			if (dist >= minDist || dist < 0.0001) continue;

			const nx = dx / dist;
			const nz = dz / dist;
			const overlap = minDist - dist;

			// Separate based on inverse mass
			const totalInvMass = (a.isStatic ? 0 : 1 / a.mass) + (b.isStatic ? 0 : 1 / b.mass);
			if (totalInvMass === 0) continue;

			if (!a.isStatic) {
				const ratio = 1 / a.mass / totalInvMass;
				a.obj.position.x += nx * overlap * ratio;
				a.obj.position.z += nz * overlap * ratio;
			}
			if (!b.isStatic) {
				const ratio = 1 / b.mass / totalInvMass;
				b.obj.position.x -= nx * overlap * ratio;
				b.obj.position.z -= nz * overlap * ratio;
			}

			// Velocity response — relative velocity along collision normal
			const relVx = a.vx - b.vx;
			const relVz = a.vz - b.vz;
			const relDotN = relVx * nx + relVz * nz;

			// Only resolve if bodies are approaching
			if (relDotN > 0) continue;

			const impulse = (-(1 + RESTITUTION) * relDotN) / totalInvMass;

			if (!a.isStatic) {
				a.vx += (impulse * nx) / a.mass;
				a.vz += (impulse * nz) / a.mass;
				a.sleeping = false;
			}
			if (!b.isStatic) {
				b.vx -= (impulse * nx) / b.mass;
				b.vz -= (impulse * nz) / b.mass;
				b.sleeping = false;
			}
		}
	}
}

/** Step physics. Returns true if any body moved. */
export function tickPhysics(dt: number): boolean {
	let anyActive = false;

	for (const body of bodies) {
		if (body.isStatic || body.sleeping) continue;

		// Apply friction (exponential decay)
		const frictionFactor = Math.exp(-FRICTION * dt);
		body.vx *= frictionFactor;
		body.vz *= frictionFactor;

		// Integrate position
		body.obj.position.x += body.vx * dt;
		body.obj.position.z += body.vz * dt;

		// Clamp to desk — bounce off edges
		if (body.obj.position.x < DESK_BOUNDS.minX) {
			body.obj.position.x = DESK_BOUNDS.minX;
			body.vx = Math.abs(body.vx) * RESTITUTION;
		} else if (body.obj.position.x > DESK_BOUNDS.maxX) {
			body.obj.position.x = DESK_BOUNDS.maxX;
			body.vx = -Math.abs(body.vx) * RESTITUTION;
		}
		if (body.obj.position.z < DESK_BOUNDS.minZ) {
			body.obj.position.z = DESK_BOUNDS.minZ;
			body.vz = Math.abs(body.vz) * RESTITUTION;
		} else if (body.obj.position.z > DESK_BOUNDS.maxZ) {
			body.obj.position.z = DESK_BOUNDS.maxZ;
			body.vz = -Math.abs(body.vz) * RESTITUTION;
		}

		// Sleep check
		const speed = body.vx * body.vx + body.vz * body.vz;
		if (speed < VELOCITY_THRESHOLD * VELOCITY_THRESHOLD) {
			body.vx = 0;
			body.vz = 0;
			body.sleeping = true;
		} else {
			anyActive = true;
		}
	}

	resolveAllCollisions();

	return anyActive;
}

// ─── Drag interaction ───────────────────────────────────────────
export function setupDrag(
	canvas: HTMLCanvasElement,
	camera: Camera,
	scene: Scene,
	onDragChange: (isDragging: boolean) => void,
	onDirty: () => void,
): () => void {
	let dragged: Object3D | null = null;
	let dragBody: PhysicsBody | null = null;
	const dragPlane = new Plane(new Vector3(0, 1, 0), -DESK_Y);

	// Pending drag: recorded on pointerdown, only committed once pointer moves enough
	let pendingTarget: Object3D | null = null;
	let pendingDownX = 0;
	let pendingDownY = 0;
	let dragStarted = false;
	const DRAG_THRESHOLD = 4; // pixels before pointerdown becomes a drag

	// Velocity tracking: store recent positions to compute release velocity
	const posSamples: { x: number; z: number; t: number }[] = [];

	const meshes = collectMeshesBy(scene, "draggable");
	for (const obj of scene.children) {
		if (obj.userData?.draggable) ensureBody(obj);
	}

	function beginDrag(): void {
		if (!pendingTarget) return;
		dragged = pendingTarget;
		dragBody = ensureBody(dragged);
		dragBody.vx = 0;
		dragBody.vz = 0;
		dragBody.sleeping = true;

		dragPlane.constant = -dragBody.restY;
		raycaster.ray.intersectPlane(dragPlane, _intersection);
		_offset.copy(dragged.position).sub(_intersection);

		posSamples.length = 0;
		posSamples.push({ x: dragged.position.x, z: dragged.position.z, t: performance.now() });

		dragStarted = true;
		canvas.style.cursor = "grabbing";
		onDragChange(true);
	}

	function onPointerDown(e: PointerEvent): void {
		updatePointer(canvas, e.clientX, e.clientY);
		raycaster.setFromCamera(pointer, camera);
		const hits = raycaster.intersectObjects(meshes, false);
		if (hits.length === 0) return;

		const ancestor = getAncestorWith(hits[0].object, "draggable");
		if (!ancestor) return;

		// Record as pending — don't start drag until pointer moves
		pendingTarget = ancestor;
		pendingDownX = e.clientX;
		pendingDownY = e.clientY;
		dragStarted = false;
	}

	function onPointerMove(e: PointerEvent): void {
		// Check if pending drag should start
		if (pendingTarget && !dragStarted) {
			const dx = e.clientX - pendingDownX;
			const dy = e.clientY - pendingDownY;
			if (dx * dx + dy * dy > DRAG_THRESHOLD * DRAG_THRESHOLD) {
				updatePointer(canvas, e.clientX, e.clientY);
				raycaster.setFromCamera(pointer, camera);
				beginDrag();
			}
			return;
		}

		if (!dragged || !dragBody) {
			// Hover cursor for draggables
			updatePointer(canvas, e.clientX, e.clientY);
			raycaster.setFromCamera(pointer, camera);
			const hits = raycaster.intersectObjects(meshes, false);
			if (hits.length > 0 && getAncestorWith(hits[0].object, "draggable")) {
				canvas.style.cursor = "grab";
			}
			return;
		}

		updatePointer(canvas, e.clientX, e.clientY);
		raycaster.setFromCamera(pointer, camera);
		dragPlane.constant = -dragBody.restY;
		raycaster.ray.intersectPlane(dragPlane, _intersection);

		dragged.position.x = clamp(_intersection.x + _offset.x, DESK_BOUNDS.minX, DESK_BOUNDS.maxX);
		dragged.position.z = clamp(_intersection.z + _offset.z, DESK_BOUNDS.minZ, DESK_BOUNDS.maxZ);

		// Track position samples for release velocity
		const now = performance.now();
		posSamples.push({ x: dragged.position.x, z: dragged.position.z, t: now });
		if (posSamples.length > VELOCITY_SAMPLES) posSamples.shift();

		// Resolve collisions during drag
		for (const body of bodies) {
			if (body.obj === dragged) continue;
			const dx = body.obj.position.x - dragged.position.x;
			const dz = body.obj.position.z - dragged.position.z;
			const dist = Math.sqrt(dx * dx + dz * dz);
			const minDist = dragBody.radius + body.radius;
			if (dist < minDist && dist > 0.0001) {
				const nx = dx / dist;
				const nz = dz / dist;
				const push = minDist - dist;
				if (body.isStatic) {
					// Static obstacle: push the dragged object away
					dragged.position.x -= nx * push;
					dragged.position.z -= nz * push;
				} else {
					// Dynamic body: push it out of the way and give it velocity
					body.obj.position.x += nx * push;
					body.obj.position.z += nz * push;
					body.obj.position.x = clamp(body.obj.position.x, DESK_BOUNDS.minX, DESK_BOUNDS.maxX);
					body.obj.position.z = clamp(body.obj.position.z, DESK_BOUNDS.minZ, DESK_BOUNDS.maxZ);
					body.vx += nx * push * 8;
					body.vz += nz * push * 8;
					body.sleeping = false;
				}
			}
		}

		onDirty();
	}

	function onPointerUp(): void {
		// Clear pending drag (was just a click, not a drag)
		pendingTarget = null;

		if (!dragged || !dragBody) return;

		// Compute release velocity from position samples
		if (posSamples.length >= 2) {
			const oldest = posSamples[0];
			const newest = posSamples[posSamples.length - 1];
			const dt = (newest.t - oldest.t) / 1000;
			if (dt > 0.005) {
				dragBody.vx = (newest.x - oldest.x) / dt;
				dragBody.vz = (newest.z - oldest.z) / dt;
				// Cap release velocity so objects don't fly off
				const maxV = 5;
				const speed = Math.sqrt(dragBody.vx * dragBody.vx + dragBody.vz * dragBody.vz);
				if (speed > maxV) {
					dragBody.vx = (dragBody.vx / speed) * maxV;
					dragBody.vz = (dragBody.vz / speed) * maxV;
				}
				dragBody.sleeping = false;
			}
		}

		dragged = null;
		dragBody = null;
		posSamples.length = 0;
		canvas.style.cursor = "default";
		onDragChange(false);
	}

	canvas.addEventListener("pointerdown", onPointerDown);
	canvas.addEventListener("pointermove", onPointerMove);
	window.addEventListener("pointerup", onPointerUp);

	return () => {
		canvas.removeEventListener("pointerdown", onPointerDown);
		canvas.removeEventListener("pointermove", onPointerMove);
		window.removeEventListener("pointerup", onPointerUp);
		canvas.style.cursor = "default";
	};
}
