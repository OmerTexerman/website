import { type Camera, type Object3D, Plane, Raycaster, type Scene, Vector2, Vector3 } from "three";

const raycaster = new Raycaster();
const pointer = new Vector2();
const intersection = new Vector3();
const offset = new Vector3();

const DESK_Y = 0.12;
const GRAVITY = 9.8;
const LIFT_HEIGHT = 0.6;
const DESK_BOUNDS = { minX: -2.3, maxX: 2.3, minZ: -1.3, maxZ: 1.3 };

interface Obstacle {
	x: number;
	z: number;
	radius: number;
}

interface PhysicsBody {
	obj: Object3D;
	restY: number;
	velocityY: number;
	falling: boolean;
	radius: number;
}

const bodies: PhysicsBody[] = [];
const staticObstacles: Obstacle[] = [];

/** Register a static obstacle (interactive objects that don't move) */
export function addStaticObstacle(obj: Object3D, radius = 0.3): void {
	staticObstacles.push({ x: obj.position.x, z: obj.position.z, radius });
}

function getDraggableAncestor(obj: Object3D): Object3D | null {
	let current: Object3D | null = obj;
	while (current) {
		if (current.userData?.draggable) return current;
		current = current.parent;
	}
	return null;
}

function collectDraggableMeshes(scene: Scene): Object3D[] {
	const meshes: Object3D[] = [];
	scene.traverse((child) => {
		if (child.userData?.draggable) {
			child.traverse((c) => meshes.push(c));
		}
	});
	return meshes;
}

function collectDraggableGroups(scene: Scene): Object3D[] {
	const groups: Object3D[] = [];
	scene.traverse((child) => {
		if (child.userData?.draggable) {
			groups.push(child);
		}
	});
	return groups;
}

function ensureBody(obj: Object3D, radius = 0.15): PhysicsBody {
	let body = bodies.find((b) => b.obj === obj);
	if (!body) {
		body = { obj, restY: obj.position.y, velocityY: 0, falling: false, radius };
		bodies.push(body);
	}
	return body;
}

/** Resolve collisions between dragged object and both dynamic bodies + static obstacles */
function resolveCollisions(dragged: Object3D, dragRadius: number): void {
	// Against other draggable bodies
	for (const body of bodies) {
		if (body.obj === dragged) continue;
		const dx = body.obj.position.x - dragged.position.x;
		const dz = body.obj.position.z - dragged.position.z;
		const dist = Math.sqrt(dx * dx + dz * dz);
		const minDist = dragRadius + body.radius;

		if (dist < minDist && dist > 0.001) {
			const pushForce = (minDist - dist) * 0.35;
			const nx = dx / dist;
			const nz = dz / dist;
			body.obj.position.x += nx * pushForce;
			body.obj.position.z += nz * pushForce;
			body.obj.position.x = Math.max(
				DESK_BOUNDS.minX,
				Math.min(DESK_BOUNDS.maxX, body.obj.position.x),
			);
			body.obj.position.z = Math.max(
				DESK_BOUNDS.minZ,
				Math.min(DESK_BOUNDS.maxZ, body.obj.position.z),
			);
		}
	}

	// Against static obstacles (interactive objects) — push the dragged object away
	for (const obs of staticObstacles) {
		const dx = dragged.position.x - obs.x;
		const dz = dragged.position.z - obs.z;
		const dist = Math.sqrt(dx * dx + dz * dz);
		const minDist = dragRadius + obs.radius;

		if (dist < minDist && dist > 0.001) {
			const pushForce = minDist - dist;
			const nx = dx / dist;
			const nz = dz / dist;
			dragged.position.x += nx * pushForce;
			dragged.position.z += nz * pushForce;
			dragged.position.x = Math.max(
				DESK_BOUNDS.minX,
				Math.min(DESK_BOUNDS.maxX, dragged.position.x),
			);
			dragged.position.z = Math.max(
				DESK_BOUNDS.minZ,
				Math.min(DESK_BOUNDS.maxZ, dragged.position.z),
			);
		}
	}
}

/** Step physics for all bodies — returns true if any body moved */
export function tickPhysics(dt: number): boolean {
	let anyMoved = false;
	for (const body of bodies) {
		if (!body.falling) continue;

		body.velocityY -= GRAVITY * dt;
		body.obj.position.y += body.velocityY * dt;

		if (body.obj.position.y <= body.restY) {
			body.obj.position.y = body.restY;
			if (Math.abs(body.velocityY) < 0.3) {
				body.velocityY = 0;
				body.falling = false;
			} else {
				body.velocityY = -body.velocityY * 0.3;
			}
		}
		anyMoved = true;
	}
	return anyMoved;
}

export function setupDrag(
	canvas: HTMLCanvasElement,
	camera: Camera,
	scene: Scene,
	onDragChange: (isDragging: boolean) => void,
): () => void {
	let dragged: Object3D | null = null;
	let dragBody: PhysicsBody | null = null;

	const dragPlane = new Plane(new Vector3(0, 1, 0), -DESK_Y);

	for (const obj of collectDraggableGroups(scene)) {
		ensureBody(obj);
	}

	function updatePointer(e: MouseEvent | Touch): void {
		const rect = canvas.getBoundingClientRect();
		pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
		pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
	}

	function handlePointerDown(e: MouseEvent): void {
		updatePointer(e);
		raycaster.setFromCamera(pointer, camera);

		const meshes = collectDraggableMeshes(scene);
		const hits = raycaster.intersectObjects(meshes, false);

		if (hits.length > 0) {
			const ancestor = getDraggableAncestor(hits[0].object);
			if (ancestor) {
				dragged = ancestor;
				dragBody = ensureBody(ancestor);
				dragBody.falling = false;
				dragBody.velocityY = 0;

				dragPlane.constant = -dragged.position.y;
				raycaster.ray.intersectPlane(dragPlane, intersection);
				offset.copy(dragged.position).sub(intersection);

				canvas.style.cursor = "grabbing";
				onDragChange(true);
				e.preventDefault();
			}
		}
	}

	function handlePointerMove(e: MouseEvent): void {
		if (!dragged || !dragBody) {
			updatePointer(e);
			raycaster.setFromCamera(pointer, camera);
			const meshes = collectDraggableMeshes(scene);
			const hits = raycaster.intersectObjects(meshes, false);
			if (hits.length > 0 && getDraggableAncestor(hits[0].object)) {
				canvas.style.cursor = "grab";
			}
			return;
		}

		updatePointer(e);
		raycaster.setFromCamera(pointer, camera);

		dragPlane.constant = -(dragBody.restY + LIFT_HEIGHT);
		raycaster.ray.intersectPlane(dragPlane, intersection);

		const newX = Math.max(DESK_BOUNDS.minX, Math.min(DESK_BOUNDS.maxX, intersection.x + offset.x));
		const newZ = Math.max(DESK_BOUNDS.minZ, Math.min(DESK_BOUNDS.maxZ, intersection.z + offset.z));

		dragged.position.x = newX;
		dragged.position.y = dragBody.restY + LIFT_HEIGHT;
		dragged.position.z = newZ;

		resolveCollisions(dragged, dragBody.radius);
	}

	function handlePointerUp(): void {
		if (dragged && dragBody) {
			dragBody.velocityY = 0;
			dragBody.falling = true;

			dragged = null;
			dragBody = null;
			canvas.style.cursor = "default";
			onDragChange(false);
		}
	}

	function handleTouchStart(e: TouchEvent): void {
		if (e.touches.length !== 1) return;
		handlePointerDown({
			clientX: e.touches[0].clientX,
			clientY: e.touches[0].clientY,
			preventDefault: () => e.preventDefault(),
		} as MouseEvent);
	}

	function handleTouchMove(e: TouchEvent): void {
		if (!dragged || e.touches.length !== 1) return;
		e.preventDefault();
		handlePointerMove({
			clientX: e.touches[0].clientX,
			clientY: e.touches[0].clientY,
		} as MouseEvent);
	}

	canvas.addEventListener("mousedown", handlePointerDown);
	canvas.addEventListener("mousemove", handlePointerMove);
	window.addEventListener("mouseup", handlePointerUp);
	canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
	canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
	canvas.addEventListener("touchend", handlePointerUp);

	return () => {
		canvas.removeEventListener("mousedown", handlePointerDown);
		canvas.removeEventListener("mousemove", handlePointerMove);
		window.removeEventListener("mouseup", handlePointerUp);
		canvas.removeEventListener("touchstart", handleTouchStart);
		canvas.removeEventListener("touchmove", handleTouchMove);
		canvas.removeEventListener("touchend", handlePointerUp);
	};
}
