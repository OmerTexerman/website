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
			child.traverse((descendant) => meshes.push(descendant));
		}
	});
	return meshes;
}

function collectDraggableGroups(scene: Scene): Object3D[] {
	const groups: Object3D[] = [];
	scene.traverse((child) => {
		if (child.userData?.draggable) groups.push(child);
	});
	return groups;
}

function ensureBody(obj: Object3D, radius = 0.15): PhysicsBody {
	let body = bodies.find((entry) => entry.obj === obj);
	if (!body) {
		body = { obj, restY: obj.position.y, velocityY: 0, falling: false, radius };
		bodies.push(body);
	}
	return body;
}

/** Resolve collisions between dragged object and both dynamic bodies + static obstacles */
function resolveCollisions(dragged: Object3D, dragRadius: number): void {
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

	for (const obstacle of staticObstacles) {
		const dx = dragged.position.x - obstacle.x;
		const dz = dragged.position.z - obstacle.z;
		const dist = Math.sqrt(dx * dx + dz * dz);
		const minDist = dragRadius + obstacle.radius;

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
	const draggableGroups = collectDraggableGroups(scene);
	const draggableMeshes = collectDraggableMeshes(scene);

	for (const obj of draggableGroups) {
		ensureBody(obj);
	}

	function updatePointer(clientX: number, clientY: number): void {
		const rect = canvas.getBoundingClientRect();
		pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
		pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
	}

	function updateHoverCursor(clientX: number, clientY: number): void {
		if (dragged) return;
		updatePointer(clientX, clientY);
		raycaster.setFromCamera(pointer, camera);
		const hits = raycaster.intersectObjects(draggableMeshes, false);
		const canDrag = hits.length > 0 && Boolean(getDraggableAncestor(hits[0].object));
		canvas.style.cursor = canDrag ? "grab" : "default";
	}

	function onPointerDown(e: PointerEvent): void {
		updatePointer(e.clientX, e.clientY);
		raycaster.setFromCamera(pointer, camera);
		const hits = raycaster.intersectObjects(draggableMeshes, false);
		if (hits.length === 0) return;

		const ancestor = getDraggableAncestor(hits[0].object);
		if (!ancestor) return;

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

	function onPointerMove(e: PointerEvent): void {
		if (!dragged || !dragBody) {
			updateHoverCursor(e.clientX, e.clientY);
			return;
		}

		updatePointer(e.clientX, e.clientY);
		raycaster.setFromCamera(pointer, camera);

		dragPlane.constant = -(dragBody.restY + LIFT_HEIGHT);
		raycaster.ray.intersectPlane(dragPlane, intersection);

		dragged.position.x = Math.max(
			DESK_BOUNDS.minX,
			Math.min(DESK_BOUNDS.maxX, intersection.x + offset.x),
		);
		dragged.position.y = dragBody.restY + LIFT_HEIGHT;
		dragged.position.z = Math.max(
			DESK_BOUNDS.minZ,
			Math.min(DESK_BOUNDS.maxZ, intersection.z + offset.z),
		);

		resolveCollisions(dragged, dragBody.radius);
	}

	function releaseDragState(): void {
		if (!dragged || !dragBody) return;
		dragBody.velocityY = 0;
		dragBody.falling = true;
		dragged = null;
		dragBody = null;
		canvas.style.cursor = "default";
		onDragChange(false);
	}

	canvas.addEventListener("pointerdown", onPointerDown);
	canvas.addEventListener("pointermove", onPointerMove, { passive: true });
	window.addEventListener("pointerup", releaseDragState);

	return () => {
		canvas.removeEventListener("pointerdown", onPointerDown);
		canvas.removeEventListener("pointermove", onPointerMove);
		window.removeEventListener("pointerup", releaseDragState);
		canvas.style.cursor = "default";
	};
}
