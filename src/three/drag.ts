import {
	Box3,
	BoxGeometry,
	type Camera,
	Mesh,
	type Object3D,
	Plane,
	Raycaster,
	type Scene,
	Vector2,
	Vector3,
} from "three";
import { ceramicMaterial } from "./materials";
import { clamp, DESK_SURFACE_Y, lerp } from "./math-utils";
import { collectMeshesBy, getAncestorWith, updatePointer } from "./raycast-utils";

const intersectionPoint = new Vector3();
const dragOffset = new Vector3();
const _box = new Box3();

const FRICTION = 8.0;
const RESTITUTION = 0.4;
const VELOCITY_THRESHOLD = 0.005;
const VELOCITY_SAMPLES = 5;
// Physical desktop half-extents — once an object's center crosses these it
// tips over the edge and falls.
const DESK_EDGE_X = 2.5;
const DESK_EDGE_Z = 1.5;
// A held object may be carried past the edge, but not out of the shot.
const DRAG_BOUNDS = { minX: -3.4, maxX: 3.4, minZ: -2.0, maxZ: 2.4 };
const GRAVITY = 16;
const FLOOR_Y = -2;
const FLOOR_RESTITUTION = 0.35;
// Below this impact speed a landing object settles instead of bouncing again.
const SETTLE_SPEED = 1.0;
const FLOOR_LINGER_SEC = 1.4;
const SHATTER_LINGER_SEC = 2.0;
const VANISH_DURATION_SEC = 0.22;
const SPAWN_DURATION_SEC = 0.35;
const SHARD_COUNT = 11;
const SHARD_FADE_SEC = 0.35;
// Time to ease a landed object back to its flat resting orientation so the
// tumble doesn't leave it clipped into the floor.
const FLOP_DURATION_SEC = 0.25;

// Lifecycle of a dynamic body. "desk" is the only interactive state; the rest
// carry an object off the edge, onto the floor, and back to its home spot.
type BodyMode = "desk" | "airborne" | "floor" | "vanishing" | "spawning";

interface PhysicsBody {
	obj: Object3D;
	radius: number;
	mass: number;
	restY: number;
	// Half of the widest horizontal extent — how far a tumbled object can
	// swing below its pivot, used to keep it from clipping into the floor
	halfExtent: number;
	vx: number;
	vz: number;
	sleeping: boolean;
	isStatic: boolean;
	mode: BodyMode;
	vy: number;
	spinX: number;
	spinZ: number;
	timer: number;
	// Flop-flat interpolation after floor contact; flopT < 0 means inactive
	flopT: number;
	flopFromX: number;
	flopFromZ: number;
	flopToX: number;
	flopToZ: number;
	wasInteractive: boolean;
	home: { x: number; y: number; z: number; rx: number; ry: number; rz: number };
}

interface Shard {
	mesh: Mesh;
	vx: number;
	vy: number;
	vz: number;
	spinX: number;
	spinZ: number;
	restY: number;
	life: number;
}

export interface DeskPhysicsController {
	addStaticObstacle: (obj: Object3D, radius?: number) => void;
	tick: (dt: number) => boolean;
	setupDrag: (
		canvas: HTMLCanvasElement,
		camera: Camera,
		scene: Scene,
		onDragChange: (isDragging: boolean) => void,
		onDirty: () => void,
	) => () => void;
	dispose: () => void;
}

export function createDeskPhysicsController(): DeskPhysicsController {
	const bodies: PhysicsBody[] = [];
	const shards: Shard[] = [];

	function makeBody(obj: Object3D, radius: number, isStatic: boolean): PhysicsBody {
		_box.setFromObject(obj);
		return {
			obj,
			radius,
			mass: 1,
			restY: obj.position.y,
			halfExtent: Math.max(_box.max.x - _box.min.x, _box.max.z - _box.min.z) / 2,
			vx: 0,
			vz: 0,
			sleeping: true,
			isStatic,
			mode: "desk",
			vy: 0,
			spinX: 0,
			spinZ: 0,
			timer: 0,
			flopT: -1,
			flopFromX: 0,
			flopFromZ: 0,
			flopToX: 0,
			flopToZ: 0,
			wasInteractive: false,
			home: {
				x: obj.position.x,
				y: obj.position.y,
				z: obj.position.z,
				rx: obj.rotation.x,
				ry: obj.rotation.y,
				rz: obj.rotation.z,
			},
		};
	}

	function ensureBody(obj: Object3D, radius = 0.15): PhysicsBody {
		let body = bodies.find((candidate) => candidate.obj === obj);
		if (!body) {
			body = makeBody(obj, radius, false);
			bodies.push(body);
		}
		return body;
	}

	function addStaticObstacle(obj: Object3D, radius = 0.3): void {
		bodies.push(makeBody(obj, radius, true));
	}

	function beyondDeskEdge(obj: Object3D): boolean {
		return Math.abs(obj.position.x) > DESK_EDGE_X || Math.abs(obj.position.z) > DESK_EDGE_Z;
	}

	function floorRestY(body: PhysicsBody): number {
		return FLOOR_Y + (body.restY - DESK_SURFACE_Y);
	}

	/** Extra ground clearance a tumbled object needs so it doesn't clip.
	 *  Goes to zero as the flop eases the rotation back to the flat pose. */
	function swingLift(body: PhysicsBody): number {
		const dx = body.obj.rotation.x - body.home.rx;
		const dz = body.obj.rotation.z - body.home.rz;
		const tilt = Math.max(Math.abs(Math.sin(dx)), Math.abs(Math.sin(dz)));
		return body.halfExtent * tilt;
	}

	function startFall(body: PhysicsBody): void {
		body.mode = "airborne";
		body.sleeping = false;
		body.vy = 0;
		body.flopT = -1;
		// Tumble roughly around the axis perpendicular to travel, plus jitter
		body.spinX = body.vz * 1.5 + (Math.random() - 0.5) * 3;
		body.spinZ = -body.vx * 1.5 + (Math.random() - 0.5) * 3;
		// Off the desk the object can't be clicked or grabbed until it respawns
		body.wasInteractive = body.obj.userData.interactive === true;
		body.obj.userData.interactive = false;
		body.obj.userData.draggable = false;
	}

	function startFlop(body: PhysicsBody): void {
		if (body.flopT >= 0) return;
		body.spinX = 0;
		body.spinZ = 0;
		body.flopT = 0;
		body.flopFromX = body.obj.rotation.x;
		body.flopFromZ = body.obj.rotation.z;
		// Nearest full-turn equivalent of the home orientation, so the ease
		// takes the short way around instead of unwinding every tumble
		const TWO_PI = Math.PI * 2;
		body.flopToX =
			body.home.rx + Math.round((body.obj.rotation.x - body.home.rx) / TWO_PI) * TWO_PI;
		body.flopToZ =
			body.home.rz + Math.round((body.obj.rotation.z - body.home.rz) / TWO_PI) * TWO_PI;
	}

	function tickFlop(body: PhysicsBody, dt: number): void {
		if (body.flopT < 0 || body.flopT >= 1) return;
		body.flopT = Math.min(1, body.flopT + dt / FLOP_DURATION_SEC);
		const eased = 1 - (1 - body.flopT) ** 2;
		body.obj.rotation.x = lerp(body.flopFromX, body.flopToX, eased);
		body.obj.rotation.z = lerp(body.flopFromZ, body.flopToZ, eased);
	}

	function spawnShards(body: PhysicsBody): void {
		const parent = body.obj.parent;
		if (!parent) return;
		const { x, z } = body.obj.position;
		const baseY = floorRestY(body);
		for (let i = 0; i < SHARD_COUNT; i++) {
			const size = 0.025 + Math.random() * 0.04;
			const mesh = new Mesh(
				new BoxGeometry(size, size * (0.4 + Math.random() * 0.5), size),
				ceramicMaterial,
			);
			mesh.castShadow = true;
			mesh.position.set(x, baseY + 0.05, z);
			mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
			parent.add(mesh);
			const angle = (i / SHARD_COUNT) * Math.PI * 2 + Math.random() * 0.7;
			const speed = 0.5 + Math.random() * 1.1;
			shards.push({
				mesh,
				vx: Math.cos(angle) * speed,
				vz: Math.sin(angle) * speed,
				vy: 0.8 + Math.random() * 1.6,
				spinX: (Math.random() - 0.5) * 12,
				spinZ: (Math.random() - 0.5) * 12,
				restY: baseY + size * 0.4,
				life: 1.1 + Math.random() * 0.5,
			});
		}
	}

	function removeShard(index: number): void {
		const shard = shards[index];
		shard.mesh.parent?.remove(shard.mesh);
		// Material is the shared ceramic — only the geometry is per-shard
		shard.mesh.geometry.dispose();
		shards.splice(index, 1);
	}

	function respawn(body: PhysicsBody): void {
		body.obj.position.set(body.home.x, body.home.y, body.home.z);
		body.obj.rotation.set(body.home.rx, body.home.ry, body.home.rz);
		body.obj.scale.setScalar(0.001);
		body.obj.visible = true;
		body.vx = 0;
		body.vy = 0;
		body.vz = 0;
		body.spinX = 0;
		body.spinZ = 0;
		body.flopT = -1;
		body.mode = "spawning";
		body.timer = SPAWN_DURATION_SEC;
	}

	function tickShards(dt: number): boolean {
		for (let i = shards.length - 1; i >= 0; i--) {
			const shard = shards[i];
			shard.life -= dt;
			if (shard.life <= 0) {
				removeShard(i);
				continue;
			}
			shard.vy -= GRAVITY * dt;
			shard.mesh.position.x += shard.vx * dt;
			shard.mesh.position.y += shard.vy * dt;
			shard.mesh.position.z += shard.vz * dt;
			shard.mesh.rotation.x += shard.spinX * dt;
			shard.mesh.rotation.z += shard.spinZ * dt;
			if (shard.mesh.position.y < shard.restY && shard.vy < 0) {
				shard.mesh.position.y = shard.restY;
				shard.vy = -shard.vy * 0.4;
				shard.vx *= 0.6;
				shard.vz *= 0.6;
				shard.spinX *= 0.5;
				shard.spinZ *= 0.5;
			}
			shard.mesh.scale.setScalar(clamp(shard.life / SHARD_FADE_SEC, 0.001, 1));
		}
		return shards.length > 0;
	}

	function resolveAllCollisions(): void {
		for (let i = 0; i < bodies.length; i++) {
			for (let j = i + 1; j < bodies.length; j++) {
				const a = bodies[i];
				const b = bodies[j];
				if (a.isStatic && b.isStatic) continue;
				if (a.sleeping && b.sleeping) continue;
				// Only bodies on the desk surface share a collision plane
				if (a.mode !== "desk" || b.mode !== "desk") continue;

				const dx = a.obj.position.x - b.obj.position.x;
				const dz = a.obj.position.z - b.obj.position.z;
				const dist = Math.sqrt(dx * dx + dz * dz);
				const minDist = a.radius + b.radius;
				if (dist >= minDist || dist < 0.0001) continue;

				const nx = dx / dist;
				const nz = dz / dist;
				const overlap = minDist - dist;
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

				const relVx = a.vx - b.vx;
				const relVz = a.vz - b.vz;
				const relDotN = relVx * nx + relVz * nz;
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

	function tick(dt: number): boolean {
		let anyActive = tickShards(dt);

		for (const body of bodies) {
			if (body.isStatic) continue;

			switch (body.mode) {
				case "desk": {
					if (body.sleeping) break;

					const frictionFactor = Math.exp(-FRICTION * dt);
					body.vx *= frictionFactor;
					body.vz *= frictionFactor;
					body.obj.position.x += body.vx * dt;
					body.obj.position.z += body.vz * dt;

					if (beyondDeskEdge(body.obj)) {
						startFall(body);
						anyActive = true;
						break;
					}

					const speed = body.vx * body.vx + body.vz * body.vz;
					if (speed < VELOCITY_THRESHOLD * VELOCITY_THRESHOLD) {
						body.vx = 0;
						body.vz = 0;
						body.sleeping = true;
					} else {
						anyActive = true;
					}
					break;
				}
				case "airborne": {
					body.vy -= GRAVITY * dt;
					body.obj.position.x += body.vx * dt;
					body.obj.position.y += body.vy * dt;
					body.obj.position.z += body.vz * dt;
					if (body.flopT < 0) {
						body.obj.rotation.x += body.spinX * dt;
						body.obj.rotation.z += body.spinZ * dt;
					} else {
						tickFlop(body, dt);
					}

					const groundY = floorRestY(body) + swingLift(body);
					if (body.obj.position.y <= groundY && body.vy < 0) {
						body.obj.position.y = groundY;
						if (body.obj.userData.breakable) {
							body.obj.visible = false;
							spawnShards(body);
							body.mode = "vanishing";
							body.timer = SHATTER_LINGER_SEC;
						} else if (-body.vy > SETTLE_SPEED) {
							// First contact stops the tumble and starts easing flat
							startFlop(body);
							body.vy = -body.vy * FLOOR_RESTITUTION;
							body.vx *= 0.6;
							body.vz *= 0.6;
						} else {
							startFlop(body);
							body.vy = 0;
							body.mode = "floor";
							body.timer = FLOOR_LINGER_SEC;
						}
					}
					anyActive = true;
					break;
				}
				case "floor": {
					const frictionFactor = Math.exp(-FRICTION * dt);
					body.vx *= frictionFactor;
					body.vz *= frictionFactor;
					body.obj.position.x += body.vx * dt;
					body.obj.position.z += body.vz * dt;
					tickFlop(body, dt);
					// Ride the shrinking clearance down as the flop settles flat
					body.obj.position.y = floorRestY(body) + swingLift(body);
					body.timer -= dt;
					if (body.timer <= 0) {
						body.mode = "vanishing";
						body.timer = VANISH_DURATION_SEC;
					}
					anyActive = true;
					break;
				}
				case "vanishing": {
					// Doubles as the post-shatter wait (object already invisible)
					body.timer -= dt;
					if (body.obj.visible) {
						body.obj.scale.setScalar(clamp(body.timer / VANISH_DURATION_SEC, 0.001, 1));
					}
					if (body.timer <= 0) respawn(body);
					anyActive = true;
					break;
				}
				case "spawning": {
					body.timer -= dt;
					const t = clamp(1 - body.timer / SPAWN_DURATION_SEC, 0, 1);
					body.obj.scale.setScalar(Math.max(0.001, 1 - (1 - t) ** 3));
					if (body.timer <= 0) {
						body.obj.scale.setScalar(1);
						body.mode = "desk";
						body.sleeping = true;
						if (body.wasInteractive) body.obj.userData.interactive = true;
						body.obj.userData.draggable = true;
					}
					anyActive = true;
					break;
				}
			}
		}

		resolveAllCollisions();
		return anyActive;
	}

	function setupDrag(
		canvas: HTMLCanvasElement,
		camera: Camera,
		scene: Scene,
		onDragChange: (isDragging: boolean) => void,
		onDirty: () => void,
	): () => void {
		const pointer = new Vector2();
		const raycaster = new Raycaster();
		let dragged: Object3D | null = null;
		let dragBody: PhysicsBody | null = null;
		const dragPlane = new Plane(new Vector3(0, 1, 0), -DESK_SURFACE_Y);
		let pendingTarget: Object3D | null = null;
		let pendingPointerId: number | null = null;
		let activePointerId: number | null = null;
		let pendingDownX = 0;
		let pendingDownY = 0;
		let dragStarted = false;
		const DRAG_THRESHOLD = 4;
		const posSamples: { x: number; z: number; t: number }[] = [];

		const meshes = collectMeshesBy(scene, "draggable");
		scene.traverse((obj) => {
			if (obj.userData?.draggable) ensureBody(obj);
		});

		function releasePointerCapture(pointerId: number | null): void {
			if (pointerId === null) return;
			if (canvas.hasPointerCapture(pointerId)) {
				canvas.releasePointerCapture(pointerId);
			}
		}

		function clearPending(): void {
			pendingTarget = null;
			pendingPointerId = null;
			pendingDownX = 0;
			pendingDownY = 0;
			dragStarted = false;
		}

		function finishInteraction(commitVelocity: boolean): void {
			const wasDragging = dragged !== null && dragBody !== null;
			const pointerId = activePointerId ?? pendingPointerId;

			if (commitVelocity && wasDragging && dragBody && posSamples.length >= 2) {
				const body = dragBody;
				const oldest = posSamples[0];
				const newest = posSamples[posSamples.length - 1];
				const dt = (newest.t - oldest.t) / 1000;
				if (dt > 0.005) {
					body.vx = (newest.x - oldest.x) / dt;
					body.vz = (newest.z - oldest.z) / dt;
					const maxV = 5;
					const speed = Math.sqrt(body.vx * body.vx + body.vz * body.vz);
					if (speed > maxV) {
						body.vx = (body.vx / speed) * maxV;
						body.vz = (body.vz / speed) * maxV;
					}
					body.sleeping = false;
				}
			}

			// Released past the desk edge — let it drop
			if (wasDragging && dragBody && beyondDeskEdge(dragBody.obj)) {
				startFall(dragBody);
			}

			releasePointerCapture(pointerId);

			dragged = null;
			dragBody = null;
			posSamples.length = 0;
			activePointerId = null;
			clearPending();
			canvas.style.cursor = "default";

			if (wasDragging) onDragChange(false);
		}

		function beginDrag(): void {
			if (!pendingTarget) return;
			dragged = pendingTarget;
			dragBody = ensureBody(dragged);
			dragBody.vx = 0;
			dragBody.vz = 0;
			dragBody.sleeping = true;

			dragPlane.constant = -dragBody.restY;
			raycaster.ray.intersectPlane(dragPlane, intersectionPoint);
			dragOffset.copy(dragged.position).sub(intersectionPoint);

			posSamples.length = 0;
			posSamples.push({ x: dragged.position.x, z: dragged.position.z, t: performance.now() });

			activePointerId = pendingPointerId;
			dragStarted = true;
			pendingTarget = null;
			pendingPointerId = null;
			canvas.style.cursor = "grabbing";
			onDragChange(true);
		}

		function onPointerDown(e: PointerEvent): void {
			if (activePointerId !== null || pendingPointerId !== null) return;

			updatePointer(pointer, canvas, e.clientX, e.clientY);
			raycaster.setFromCamera(pointer, camera);
			const hits = raycaster.intersectObjects(meshes, false);
			if (hits.length === 0) return;

			const ancestor = getAncestorWith(hits[0].object, "draggable");
			if (!ancestor) return;

			pendingTarget = ancestor;
			pendingPointerId = e.pointerId;
			pendingDownX = e.clientX;
			pendingDownY = e.clientY;
			dragStarted = false;
			canvas.setPointerCapture?.(e.pointerId);
		}

		function onPointerMove(e: PointerEvent): void {
			if (pendingPointerId !== null && e.pointerId !== pendingPointerId) return;
			if (activePointerId !== null && e.pointerId !== activePointerId) return;

			if (pendingTarget && !dragStarted) {
				const dx = e.clientX - pendingDownX;
				const dy = e.clientY - pendingDownY;
				if (dx * dx + dy * dy > DRAG_THRESHOLD * DRAG_THRESHOLD) {
					updatePointer(pointer, canvas, e.clientX, e.clientY);
					raycaster.setFromCamera(pointer, camera);
					beginDrag();
				}
				return;
			}

			if (!dragged || !dragBody) {
				updatePointer(pointer, canvas, e.clientX, e.clientY);
				raycaster.setFromCamera(pointer, camera);
				const hits = raycaster.intersectObjects(meshes, false);
				if (hits.length > 0 && getAncestorWith(hits[0].object, "draggable")) {
					canvas.style.cursor = "grab";
				} else {
					canvas.style.cursor = "default";
				}
				return;
			}

			updatePointer(pointer, canvas, e.clientX, e.clientY);
			raycaster.setFromCamera(pointer, camera);
			dragPlane.constant = -dragBody.restY;
			raycaster.ray.intersectPlane(dragPlane, intersectionPoint);

			dragged.position.x = clamp(
				intersectionPoint.x + dragOffset.x,
				DRAG_BOUNDS.minX,
				DRAG_BOUNDS.maxX,
			);
			dragged.position.z = clamp(
				intersectionPoint.z + dragOffset.z,
				DRAG_BOUNDS.minZ,
				DRAG_BOUNDS.maxZ,
			);

			const now = performance.now();
			posSamples.push({ x: dragged.position.x, z: dragged.position.z, t: now });
			if (posSamples.length > VELOCITY_SAMPLES) posSamples.shift();

			for (const body of bodies) {
				if (body.obj === dragged) continue;
				if (body.mode !== "desk") continue;
				const dx = body.obj.position.x - dragged.position.x;
				const dz = body.obj.position.z - dragged.position.z;
				const dist = Math.sqrt(dx * dx + dz * dz);
				const minDist = dragBody.radius + body.radius;
				if (dist < minDist && dist > 0.0001) {
					const nx = dx / dist;
					const nz = dz / dist;
					const push = minDist - dist;
					if (body.isStatic) {
						dragged.position.x -= nx * push;
						dragged.position.z -= nz * push;
					} else {
						// No clamp — pushed objects may be shoved over the edge
						body.obj.position.x += nx * push;
						body.obj.position.z += nz * push;
						body.vx += nx * push * 8;
						body.vz += nz * push * 8;
						body.sleeping = false;
					}
				}
			}

			onDirty();
		}

		function onPointerUp(e: PointerEvent): void {
			if (activePointerId !== null && e.pointerId === activePointerId) {
				finishInteraction(true);
				return;
			}

			if (pendingPointerId !== null && e.pointerId === pendingPointerId) {
				finishInteraction(false);
			}
		}

		function onPointerCancel(e: PointerEvent): void {
			if (activePointerId !== null && e.pointerId === activePointerId) {
				finishInteraction(false);
				return;
			}

			if (pendingPointerId !== null && e.pointerId === pendingPointerId) {
				finishInteraction(false);
			}
		}

		function onLostPointerCapture(e: PointerEvent): void {
			if (activePointerId !== null && e.pointerId === activePointerId) {
				finishInteraction(false);
				return;
			}

			if (pendingPointerId !== null && e.pointerId === pendingPointerId) {
				finishInteraction(false);
			}
		}

		function onWindowBlur(): void {
			finishInteraction(false);
		}

		function onVisibilityChange(): void {
			if (document.visibilityState === "hidden") {
				finishInteraction(false);
			}
		}

		canvas.addEventListener("pointerdown", onPointerDown);
		canvas.addEventListener("pointermove", onPointerMove);
		canvas.addEventListener("pointercancel", onPointerCancel);
		canvas.addEventListener("lostpointercapture", onLostPointerCapture);
		window.addEventListener("pointerup", onPointerUp);
		window.addEventListener("blur", onWindowBlur);
		document.addEventListener("visibilitychange", onVisibilityChange);

		return () => {
			canvas.removeEventListener("pointerdown", onPointerDown);
			canvas.removeEventListener("pointermove", onPointerMove);
			canvas.removeEventListener("pointercancel", onPointerCancel);
			canvas.removeEventListener("lostpointercapture", onLostPointerCapture);
			window.removeEventListener("pointerup", onPointerUp);
			window.removeEventListener("blur", onWindowBlur);
			document.removeEventListener("visibilitychange", onVisibilityChange);
			finishInteraction(false);
			canvas.style.cursor = "default";
		};
	}

	function dispose(): void {
		for (let i = shards.length - 1; i >= 0; i--) removeShard(i);
		bodies.length = 0;
	}

	return { addStaticObstacle, tick, setupDrag, dispose };
}
