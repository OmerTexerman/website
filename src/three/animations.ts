import { type Mesh, MeshStandardMaterial, type Object3D, type SpotLight, Vector3 } from "three";

type AnimationCallback = (progress: number) => void;

interface ActiveAnimation {
	id: string;
	start: number;
	duration: number;
	update: AnimationCallback;
	resolve: () => void;
}

let active: ActiveAnimation[] = [];

export function easeInOutCubic(t: number): number {
	return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

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
		active.push({ id, start: performance.now(), duration, update, resolve });
	});
}

export function tickAnimations(now: number): boolean {
	let anyActive = false;
	for (let i = active.length - 1; i >= 0; i--) {
		const anim = active[i];
		const progress = Math.min((now - anim.start) / anim.duration, 1);
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

export function disposeAnimations(): void {
	active = [];
}

// ─── Rest-pose storage: one value per animated property ─────────
// Much simpler than the old full-subtree snapshot approach
const restValues = new Map<string, number>();

function restKey(objId: string, prop: string): string {
	return `${objId}:${prop}`;
}

function saveRest(obj: Object3D, prop: string, value: number): void {
	const key = restKey(obj.uuid, prop);
	if (!restValues.has(key)) restValues.set(key, value);
}

function getRest(obj: Object3D, prop: string): number {
	return restValues.get(restKey(obj.uuid, prop)) ?? 0;
}

// ─── Helper to find child by userData tag ──────────────────────
function findChild(parent: Object3D, key: string): Object3D | undefined {
	for (const child of parent.children) {
		if (child.userData?.[key]) return child;
		const found = findChild(child, key);
		if (found) return found;
	}
	return undefined;
}

// ─── NOTEBOOK (Blog) ─────────────────────────────────────────────
// The cover pivot has userData.coverPivot = true
export function animateNotebookOpen(notebook: Object3D): Promise<void> {
	const pivot = findChild(notebook, "coverPivot");
	if (!pivot) return Promise.resolve();
	saveRest(pivot, "rx", pivot.rotation.x);
	const rest = getRest(pivot, "rx");
	return animate(`notebook-${notebook.uuid}`, 600, (p) => {
		pivot.rotation.x = lerp(rest, rest - 2.8, p);
	});
}

export function animateNotebookClose(notebook: Object3D): Promise<void> {
	const pivot = findChild(notebook, "coverPivot");
	if (!pivot) return Promise.resolve();
	const current = pivot.rotation.x;
	const rest = getRest(pivot, "rx");
	return animate(`notebook-${notebook.uuid}`, 400, (p) => {
		pivot.rotation.x = lerp(current, rest, p);
	});
}

// ─── LAPTOP (Projects) ──────────────────────────────────────────
// Screen group has userData.screenGroup = true, face has userData.screenFace = true
export function animateLaptopOpen(laptop: Object3D): Promise<void> {
	const screen = findChild(laptop, "screenGroup");
	if (!screen) return Promise.resolve();
	saveRest(screen, "rx", screen.rotation.x);
	const rest = getRest(screen, "rx");

	const face = findChild(screen, "screenFace") as Mesh | undefined;
	const faceMat = face?.material instanceof MeshStandardMaterial ? face.material : null;
	let restEmissive = 0;
	if (face && faceMat) {
		saveRest(face, "emissive", faceMat.emissiveIntensity);
		restEmissive = getRest(face, "emissive");
	}

	const light = findChild(screen, "screenLight") as SpotLight | undefined;
	const restLightIntensity = light ? light.intensity : 0;

	return animate(`laptop-${laptop.uuid}`, 500, (p) => {
		screen.rotation.x = lerp(rest, rest - 0.91, p);
		if (faceMat) faceMat.emissiveIntensity = lerp(restEmissive, 8.0, p);
		if (light) light.intensity = lerp(restLightIntensity, 8.0, p);
	});
}

export function animateLaptopClose(laptop: Object3D): Promise<void> {
	const screen = findChild(laptop, "screenGroup");
	if (!screen) return Promise.resolve();
	const current = screen.rotation.x;
	const rest = getRest(screen, "rx");

	const face = findChild(screen, "screenFace") as Mesh | undefined;
	const faceMat = face?.material instanceof MeshStandardMaterial ? face.material : null;
	const curEmissive = faceMat?.emissiveIntensity ?? 0;
	const restEmissive = face && faceMat ? getRest(face, "emissive") : 0;

	const light = findChild(screen, "screenLight") as SpotLight | undefined;
	const curLightIntensity = light?.intensity ?? 0;

	return animate(`laptop-${laptop.uuid}`, 400, (p) => {
		screen.rotation.x = lerp(current, rest, p);
		if (faceMat) faceMat.emissiveIntensity = lerp(curEmissive, restEmissive, p);
		if (light) light.intensity = lerp(curLightIntensity, 2.0, p);
	});
}

// ─── BOOK STACK (Reading) ────────────────────────────────────────
export function animateBookLift(stack: Object3D): Promise<void> {
	const top = stack.children[stack.children.length - 1];
	if (!top) return Promise.resolve();
	saveRest(top, "y", top.position.y);
	saveRest(top, "rz", top.rotation.z);
	const restY = getRest(top, "y");
	const restRZ = getRest(top, "rz");
	return animate(`book-${stack.uuid}`, 500, (p) => {
		top.position.y = lerp(restY, restY + 0.3, p);
		top.rotation.z = lerp(restRZ, restRZ + 0.2, p);
	});
}

export function animateBookClose(stack: Object3D): Promise<void> {
	const top = stack.children[stack.children.length - 1];
	if (!top) return Promise.resolve();
	const curY = top.position.y;
	const curRZ = top.rotation.z;
	return animate(`book-${stack.uuid}`, 400, (p) => {
		top.position.y = lerp(curY, getRest(top, "y"), p);
		top.rotation.z = lerp(curRZ, getRest(top, "rz"), p);
	});
}

// ─── PHOTO FRAME (Photos) ───────────────────────────────────────
const _worldPos = new Vector3();
const FLY_TARGET = { x: 0, y: 3.0, z: 4.5 };

let flyingPhotoData: {
	photo: Object3D;
	frame: Object3D;
	startWorld: { x: number; y: number; z: number };
	restLocal: { x: number; y: number; z: number; rz: number };
} | null = null;

export function animateFrameReveal(frame: Object3D): Promise<void> {
	const photo = findChild(frame, "flyPhoto");
	if (!photo) return Promise.resolve();

	photo.getWorldPosition(_worldPos);
	const startWorld = { x: _worldPos.x, y: _worldPos.y, z: _worldPos.z };
	const restLocal = {
		x: photo.position.x,
		y: photo.position.y,
		z: photo.position.z,
		rz: photo.rotation.z,
	};
	const startRotZ = photo.rotation.z;

	// Reparent to scene for world-space flight
	const sceneRoot = frame.parent;
	if (!sceneRoot) return Promise.resolve();
	frame.remove(photo);
	photo.position.set(startWorld.x, startWorld.y, startWorld.z);
	photo.rotation.set(0, 0, startRotZ);
	photo.scale.set(1, 1, 1);
	sceneRoot.add(photo);

	flyingPhotoData = { photo, frame, startWorld, restLocal };

	return animate(`frame-${frame.uuid}`, 800, (p) => {
		const midY = Math.max(startWorld.y, FLY_TARGET.y) + 1.5;
		const t = p;
		const omt = 1 - t;
		// Quadratic bezier arc
		photo.position.x =
			omt * omt * startWorld.x +
			2 * omt * t * (startWorld.x * 0.3 + FLY_TARGET.x * 0.7) +
			t * t * FLY_TARGET.x;
		photo.position.y = omt * omt * startWorld.y + 2 * omt * t * midY + t * t * FLY_TARGET.y;
		photo.position.z =
			omt * omt * startWorld.z +
			2 * omt * t * ((startWorld.z + FLY_TARGET.z) / 2) +
			t * t * FLY_TARGET.z;
		photo.rotation.z = lerp(startRotZ, 0, p);
		photo.rotation.x = lerp(frame.rotation.x, 0, p);
		const s = lerp(1, 3.0, p);
		photo.scale.set(s, s, s);
	});
}

export function animateFrameClose(frame: Object3D): Promise<void> {
	if (!flyingPhotoData || flyingPhotoData.frame !== frame) return Promise.resolve();
	const { photo, startWorld, restLocal } = flyingPhotoData;
	const curPos = { x: photo.position.x, y: photo.position.y, z: photo.position.z };
	const curRotZ = photo.rotation.z;
	const curRotX = photo.rotation.x;
	const curScale = photo.scale.x;
	const saved = flyingPhotoData;

	return animate(`frame-${frame.uuid}`, 500, (p) => {
		photo.position.x = lerp(curPos.x, startWorld.x, p);
		photo.position.y = lerp(curPos.y, startWorld.y, p);
		photo.position.z = lerp(curPos.z, startWorld.z, p);
		photo.rotation.z = lerp(curRotZ, restLocal.rz, p);
		photo.rotation.x = lerp(curRotX, 0, p);
		photo.scale.setScalar(lerp(curScale, 1, p));

		if (p >= 1) {
			photo.parent?.remove(photo);
			photo.position.set(restLocal.x, restLocal.y, restLocal.z);
			photo.rotation.set(0, 0, restLocal.rz);
			photo.scale.set(1, 1, 1);
			frame.add(photo);
			if (saved === flyingPhotoData) flyingPhotoData = null;
		}
	});
}

// ─── MICRO-INTERACTIONS ─────────────────────────────────────────

/** Wobble an object (e.g. tapping a mug) */
export function animateWobble(obj: Object3D): Promise<void> {
	const baseRot = obj.rotation.z;
	return animate(`wobble-${obj.uuid}`, 400, (p) => {
		const decay = 1 - p;
		obj.rotation.z = baseRot + Math.sin(p * Math.PI * 4) * 0.08 * decay;
	});
}

/** Spin an object around its Y axis (e.g. rolling a pen) */
export function animateSpin(obj: Object3D): Promise<void> {
	const baseY = obj.rotation.y;
	return animate(`spin-${obj.uuid}`, 500, (p) => {
		obj.rotation.y = baseY + p * Math.PI * 2;
	});
}

// ─── SHELF WALL ANIMATIONS ─────────────────────────────────────

/** Slide shelf items forward toward camera with accent highlight */
export function animateShelfPresent(items: Object3D): Promise<void> {
	saveRest(items, "z", items.position.z);
	const restZ = getRest(items, "z");
	return animate(`shelf-present-${items.uuid}`, 400, (p) => {
		items.position.z = lerp(restZ, restZ + 0.15, p);
	});
}

/** Return shelf items to rest position */
export function animateShelfReset(items: Object3D): Promise<void> {
	const curZ = items.position.z;
	const restZ = getRest(items, "z");
	return animate(`shelf-present-${items.uuid}`, 300, (p) => {
		items.position.z = lerp(curZ, restZ, p);
	});
}
