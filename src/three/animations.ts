import { type Mesh, MeshStandardMaterial, type Object3D, Vector3 } from "three";

type AnimationCallback = (progress: number) => void;

interface ActiveAnimation {
	id: string;
	start: number;
	duration: number;
	update: AnimationCallback;
	resolve: () => void;
}

const active: ActiveAnimation[] = [];

/** Stored rest poses keyed by object uuid */
const restPoses = new Map<
	string,
	{
		positions: Map<string, { x: number; y: number; z: number }>;
		rotations: Map<string, { x: number; y: number; z: number }>;
		emissive: Map<string, number>;
	}
>();

function easeOutCubic(t: number): number {
	return 1 - (1 - t) ** 3;
}

function easeInOutCubic(t: number): number {
	return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

/** Cancel any running animation with the given id */
function cancelById(id: string): void {
	for (let i = active.length - 1; i >= 0; i--) {
		if (active[i].id === id) {
			active[i].resolve();
			active.splice(i, 1);
		}
	}
}

function animate(id: string, duration: number, update: AnimationCallback): Promise<void> {
	cancelById(id);
	return new Promise((resolve) => {
		active.push({
			id,
			start: performance.now(),
			duration,
			update,
			resolve,
		});
	});
}

/** Call each frame to advance all active animations */
export function tickAnimations(now: number): boolean {
	let anyActive = false;
	for (let i = active.length - 1; i >= 0; i--) {
		const anim = active[i];
		const elapsed = now - anim.start;
		const progress = Math.min(elapsed / anim.duration, 1);
		anim.update(easeInOutCubic(progress));

		if (progress >= 1) {
			anim.resolve();
			active.splice(i, 1);
		} else {
			anyActive = true;
		}
	}
	return anyActive;
}

/** Save the rest pose of an object and key children so we can always restore */
function saveRestPose(obj: Object3D): void {
	if (restPoses.has(obj.uuid)) return;
	const positions = new Map<string, { x: number; y: number; z: number }>();
	const rotations = new Map<string, { x: number; y: number; z: number }>();
	const emissive = new Map<string, number>();

	positions.set(obj.uuid, { x: obj.position.x, y: obj.position.y, z: obj.position.z });
	rotations.set(obj.uuid, { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z });

	obj.traverse((child) => {
		positions.set(child.uuid, { x: child.position.x, y: child.position.y, z: child.position.z });
		rotations.set(child.uuid, { x: child.rotation.x, y: child.rotation.y, z: child.rotation.z });
		const mesh = child as Mesh;
		if (mesh.material instanceof MeshStandardMaterial && mesh.material.emissiveIntensity > 0) {
			emissive.set(child.uuid, mesh.material.emissiveIntensity);
		}
	});

	restPoses.set(obj.uuid, { positions, rotations, emissive });
}

function getRestRotation(obj: Object3D, child: Object3D): { x: number; y: number; z: number } {
	const rest = restPoses.get(obj.uuid);
	return (
		rest?.rotations.get(child.uuid) ?? {
			x: child.rotation.x,
			y: child.rotation.y,
			z: child.rotation.z,
		}
	);
}

function getRestPosition(obj: Object3D, child: Object3D): { x: number; y: number; z: number } {
	const rest = restPoses.get(obj.uuid);
	return (
		rest?.positions.get(child.uuid) ?? {
			x: child.position.x,
			y: child.position.y,
			z: child.position.z,
		}
	);
}

// ─── NOTEBOOK (Blog) ─────────────────────────────────────────────
// Cover pivot is children[2] — rotates open along spine (x-axis)
export function animateNotebookOpen(notebook: Object3D): Promise<void> {
	saveRestPose(notebook);
	const coverPivot = notebook.children[2];
	if (!coverPivot) return Promise.resolve();
	const rest = getRestRotation(notebook, coverPivot);
	const openAngle = -2.8; // ~160 degrees open

	return animate(`notebook-open-${notebook.uuid}`, 600, (p) => {
		coverPivot.rotation.x = lerp(rest.x, rest.x + openAngle, easeOutCubic(p));
	});
}

export function animateNotebookClose(notebook: Object3D): Promise<void> {
	const coverPivot = notebook.children[2];
	if (!coverPivot) return Promise.resolve();
	const rest = getRestRotation(notebook, coverPivot);
	const currentX = coverPivot.rotation.x;

	return animate(`notebook-open-${notebook.uuid}`, 400, (p) => {
		coverPivot.rotation.x = lerp(currentX, rest.x, p);
	});
}

// ─── LAPTOP (Projects) ──────────────────────────────────────────
// Screen group is children[2], screen face (emissive) is screenGroup.children[1]
export function animateLaptopOpen(laptop: Object3D): Promise<void> {
	saveRestPose(laptop);
	const screenGroup = laptop.children[2];
	if (!screenGroup) return Promise.resolve();
	const rest = getRestRotation(laptop, screenGroup);
	const openAngle = -0.4;

	const face = screenGroup.children[1] as Mesh | undefined;
	const faceMat = face?.material instanceof MeshStandardMaterial ? face.material : null;
	const restEmissive = faceMat
		? (restPoses.get(laptop.uuid)?.emissive.get(face?.uuid) ?? faceMat.emissiveIntensity)
		: 0;

	return animate(`laptop-open-${laptop.uuid}`, 500, (p) => {
		screenGroup.rotation.x = lerp(rest.x, rest.x + openAngle, easeOutCubic(p));
		if (faceMat) {
			faceMat.emissiveIntensity = lerp(restEmissive, 5.0, p);
		}
	});
}

export function animateLaptopClose(laptop: Object3D): Promise<void> {
	const screenGroup = laptop.children[2];
	if (!screenGroup) return Promise.resolve();
	const rest = getRestRotation(laptop, screenGroup);
	const currentX = screenGroup.rotation.x;

	const face = screenGroup.children[1] as Mesh | undefined;
	const faceMat = face?.material instanceof MeshStandardMaterial ? face.material : null;
	const currentEmissive = faceMat?.emissiveIntensity ?? 0;
	const restEmissive = faceMat ? (restPoses.get(laptop.uuid)?.emissive.get(face?.uuid) ?? 2.5) : 0;

	return animate(`laptop-open-${laptop.uuid}`, 400, (p) => {
		screenGroup.rotation.x = lerp(currentX, rest.x, p);
		if (faceMat) {
			faceMat.emissiveIntensity = lerp(currentEmissive, restEmissive, p);
		}
	});
}

// ─── BOOK STACK (Reading) ────────────────────────────────────────
export function animateBookLift(bookStack: Object3D): Promise<void> {
	saveRestPose(bookStack);
	const topBook = bookStack.children[bookStack.children.length - 1];
	if (!topBook) return Promise.resolve();
	const restPos = getRestPosition(bookStack, topBook);
	const restRot = getRestRotation(bookStack, topBook);

	return animate(`book-lift-${bookStack.uuid}`, 500, (p) => {
		const ep = easeOutCubic(p);
		topBook.position.y = lerp(restPos.y, restPos.y + 0.3, ep);
		topBook.rotation.z = lerp(restRot.z, restRot.z + 0.2, ep);
	});
}

export function animateBookClose(bookStack: Object3D): Promise<void> {
	const topBook = bookStack.children[bookStack.children.length - 1];
	if (!topBook) return Promise.resolve();
	const restPos = getRestPosition(bookStack, topBook);
	const restRot = getRestRotation(bookStack, topBook);
	const curY = topBook.position.y;
	const curRZ = topBook.rotation.z;

	return animate(`book-lift-${bookStack.uuid}`, 400, (p) => {
		topBook.position.y = lerp(curY, restPos.y, p);
		topBook.rotation.z = lerp(curRZ, restRot.z, p);
	});
}

// ─── PHOTO FRAME (Photos) ───────────────────────────────────────
// The featured photo (tagged with userData.flyPhoto) peels off the board
// and arcs toward the camera in world space.

const _worldPos = new Vector3();
let flyingPhotoData: {
	photo: Object3D;
	frame: Object3D;
	startWorld: { x: number; y: number; z: number };
} | null = null;

// Target: roughly in front of the camera, slightly below center
const FLY_TARGET = { x: 0, y: 3.0, z: 4.5 };

function findFlyPhoto(frame: Object3D): Object3D | null {
	for (const child of frame.children) {
		if (child.userData?.flyPhoto) return child;
	}
	return null;
}

export function animateFrameReveal(frame: Object3D): Promise<void> {
	saveRestPose(frame);
	const flyPhoto = findFlyPhoto(frame);
	if (!flyPhoto) return Promise.resolve();

	// Get world position before reparenting
	flyPhoto.getWorldPosition(_worldPos);
	const startWorld = { x: _worldPos.x, y: _worldPos.y, z: _worldPos.z };
	const startRotZ = flyPhoto.rotation.z;

	// Reparent to scene (preserving world transform)
	const sceneRoot = frame.parent;
	if (!sceneRoot) return Promise.resolve();
	frame.remove(flyPhoto);
	flyPhoto.position.set(startWorld.x, startWorld.y, startWorld.z);
	flyPhoto.rotation.set(0, 0, startRotZ);
	flyPhoto.scale.set(1, 1, 1);
	sceneRoot.add(flyPhoto);

	flyingPhotoData = { photo: flyPhoto, frame, startWorld };

	return animate(`frame-reveal-${frame.uuid}`, 800, (p) => {
		const ep = easeOutCubic(p);
		// Arc path: quadratic bezier with a high control point
		const midY = Math.max(startWorld.y, FLY_TARGET.y) + 1.5;
		const t = ep;
		const oneMinusT = 1 - t;
		// Bezier: P = (1-t)^2 * P0 + 2(1-t)t * Pmid + t^2 * P1
		flyPhoto.position.x =
			oneMinusT * oneMinusT * startWorld.x +
			2 * oneMinusT * t * (startWorld.x * 0.3 + FLY_TARGET.x * 0.7) +
			t * t * FLY_TARGET.x;
		flyPhoto.position.y =
			oneMinusT * oneMinusT * startWorld.y + 2 * oneMinusT * t * midY + t * t * FLY_TARGET.y;
		flyPhoto.position.z =
			oneMinusT * oneMinusT * startWorld.z +
			2 * oneMinusT * t * ((startWorld.z + FLY_TARGET.z) / 2) +
			t * t * FLY_TARGET.z;

		flyPhoto.rotation.z = lerp(startRotZ, 0, ep);
		flyPhoto.rotation.x = lerp(frame.rotation.x, 0, ep); // un-tilt from frame lean
		const s = lerp(1, 3.0, ep);
		flyPhoto.scale.set(s, s, s);
	});
}

export function animateFrameClose(frame: Object3D): Promise<void> {
	if (!flyingPhotoData || flyingPhotoData.frame !== frame) return Promise.resolve();

	const { photo, startWorld } = flyingPhotoData;
	const curPos = { x: photo.position.x, y: photo.position.y, z: photo.position.z };
	const curRotZ = photo.rotation.z;
	const curRotX = photo.rotation.x;
	const curScale = photo.scale.x;

	const restRot = getRestRotation(frame, photo);
	const restPos = getRestPosition(frame, photo);
	const savedData = flyingPhotoData;

	return animate(`frame-reveal-${frame.uuid}`, 500, (p) => {
		const ep = easeOutCubic(p);
		// Fly back along a direct path
		photo.position.x = lerp(curPos.x, startWorld.x, ep);
		photo.position.y = lerp(curPos.y, startWorld.y, ep);
		photo.position.z = lerp(curPos.z, startWorld.z, ep);
		photo.rotation.z = lerp(curRotZ, restRot.z, ep);
		photo.rotation.x = lerp(curRotX, 0, ep);
		const s = lerp(curScale, 1, ep);
		photo.scale.set(s, s, s);

		// At the end, reparent back to frame
		if (p >= 1) {
			const sceneRoot = photo.parent;
			if (sceneRoot) sceneRoot.remove(photo);
			photo.position.set(restPos.x, restPos.y, restPos.z);
			photo.rotation.set(0, 0, restRot.z);
			photo.scale.set(1, 1, 1);
			frame.add(photo);
			if (savedData === flyingPhotoData) flyingPhotoData = null;
		}
	});
}
