import { type Mesh, MeshStandardMaterial, type Object3D, type SpotLight, Vector3 } from "three";
import { clamp, lerp } from "./math-utils";

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
	restValues.clear();
	flyingPhotoData = null;
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

function findChildren(parent: Object3D, key: string): Object3D[] {
	const matches: Object3D[] = [];
	for (const child of parent.children) {
		if (child.userData?.[key]) matches.push(child);
		matches.push(...findChildren(child, key));
	}
	return matches;
}

const DESKTOP_CAMERA_WORLD_POS = new Vector3(0, 5, 7);
const _cameraLocalPos = new Vector3();

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
const READING_OPEN_DURATION_MS = 920;
const READING_CLOSE_DURATION_MS = 1400;
const READING_COVER_OPEN_RX = 1.22;
const READING_PAGE_BLOCK_INSET_RX = 0.24;
const READING_LOOSE_PAGE_MARGIN_RX = 0.18;
const READING_CAMERA_YAW_BIAS = -0.2;
const READING_CAMERA_PITCH_BIAS = -0.3;
const READING_LOOSE_PAGE_EDGE_RX =
	READING_COVER_OPEN_RX - READING_PAGE_BLOCK_INSET_RX - READING_LOOSE_PAGE_MARGIN_RX;

export function animateBookLift(stack: Object3D): Promise<void> {
	const books = stack.children
		.filter((child) => child.userData?.bookItem)
		.sort((a, b) => (a.userData?.bookIndex ?? 0) - (b.userData?.bookIndex ?? 0));
	const hero = books.find((child) => child.userData?.heroBook);
	if (!hero) return Promise.resolve();

	const lowerBooks = books.filter((child) => child !== hero);
	const backCoverPivot = findChild(hero, "backCoverPivot");
	const leftPageBlockPivot = findChild(hero, "leftPageBlockPivot");
	const rightPageBlockPivot = findChild(hero, "rightPageBlockPivot");
	const middlePageFanPivot = findChild(hero, "middlePageFanPivot");
	const frontCoverPivot = findChild(hero, "frontCoverPivot");
	const loosePages = findChildren(hero, "loosePagePivot").sort(
		(a, b) => (a.userData?.loosePageIndex ?? 0) - (b.userData?.loosePageIndex ?? 0),
	);

	saveRest(hero, "x", hero.position.x);
	saveRest(hero, "y", hero.position.y);
	saveRest(hero, "z", hero.position.z);
	saveRest(hero, "rx", hero.rotation.x);
	saveRest(hero, "ry", hero.rotation.y);
	saveRest(hero, "rz", hero.rotation.z);
	for (const book of lowerBooks) {
		saveRest(book, "x", book.position.x);
		saveRest(book, "y", book.position.y);
		saveRest(book, "z", book.position.z);
		saveRest(book, "rx", book.rotation.x);
		saveRest(book, "ry", book.rotation.y);
		saveRest(book, "rz", book.rotation.z);
	}
	if (backCoverPivot) {
		saveRest(backCoverPivot, "rx", backCoverPivot.rotation.x);
	}
	if (leftPageBlockPivot) {
		saveRest(leftPageBlockPivot, "rx", leftPageBlockPivot.rotation.x);
	}
	if (rightPageBlockPivot) {
		saveRest(rightPageBlockPivot, "rx", rightPageBlockPivot.rotation.x);
	}
	if (middlePageFanPivot) {
		saveRest(middlePageFanPivot, "rx", middlePageFanPivot.rotation.x);
	}
	if (frontCoverPivot) {
		saveRest(frontCoverPivot, "rx", frontCoverPivot.rotation.x);
	}
	for (const leaf of loosePages) {
		saveRest(leaf, "rx", leaf.rotation.x);
	}

	return animate(`book-${stack.uuid}`, READING_OPEN_DURATION_MS, (p) => {
		const lift = easeInOutCubic(clamp(p / 0.28, 0, 1));
		const present = easeInOutCubic(clamp((p - 0.12) / 0.28, 0, 1));
		const open = easeInOutCubic(clamp((p - 0.34) / 0.38, 0, 1));
		const riffle = clamp((p - 0.62) / 0.2, 0, 1);

		const restX = getRest(hero, "x");
		const restY = getRest(hero, "y");
		const restZ = getRest(hero, "z");
		const restRX = getRest(hero, "rx");
		const restRY = getRest(hero, "ry");
		const restRZ = getRest(hero, "rz");

		hero.position.x = lerp(restX, restX - 0.095, present);
		hero.position.y = lerp(restY, restY + 0.45, lift);
		hero.position.z = lerp(restZ, restZ + 0.22, present);
		let targetPitch = restRX + 0.14;
		let targetYaw = restRY;
		if (hero.parent) {
			hero.parent.updateWorldMatrix(true, false);
			_cameraLocalPos.copy(DESKTOP_CAMERA_WORLD_POS);
			hero.parent.worldToLocal(_cameraLocalPos);
			const cameraDirX = _cameraLocalPos.x - hero.position.x;
			const cameraDirY = _cameraLocalPos.y - hero.position.y;
			const cameraDirZ = _cameraLocalPos.z - hero.position.z;
			const horizontalDistance = Math.hypot(cameraDirX, cameraDirZ);
			if (horizontalDistance > 0.0001) {
				targetPitch =
					-Math.atan2(cameraDirY, horizontalDistance) * 0.72 + READING_CAMERA_PITCH_BIAS;
			}
			if (Math.abs(cameraDirX) + Math.abs(cameraDirZ) > 0.0001) {
				targetYaw = Math.atan2(cameraDirX, cameraDirZ) + Math.PI + READING_CAMERA_YAW_BIAS;
			}
		}
		hero.rotation.x = lerp(restRX, targetPitch, present);
		hero.rotation.y = lerp(restRY, targetYaw, present);
		hero.rotation.z = lerp(restRZ, restRZ - 1.53, present);

		for (let i = 0; i < lowerBooks.length; i++) {
			const book = lowerBooks[i];
			const settle = easeInOutCubic(clamp((p - i * 0.03) / 0.2, 0, 1));
			const restBookY = getRest(book, "y");
			const restBookRZ = getRest(book, "rz");
			book.position.y = lerp(restBookY, restBookY - 0.005 * (i + 1), settle);
			book.rotation.z = lerp(restBookRZ, restBookRZ + (i % 2 === 0 ? -0.018 : 0.018), settle);
		}

		if (backCoverPivot) {
			const restBackCoverRX = getRest(backCoverPivot, "rx");
			backCoverPivot.rotation.x = lerp(
				restBackCoverRX,
				restBackCoverRX + READING_COVER_OPEN_RX,
				open,
			);
		}

		if (leftPageBlockPivot) {
			const restLeftPagesRX = getRest(leftPageBlockPivot, "rx");
			leftPageBlockPivot.rotation.x = lerp(
				restLeftPagesRX,
				restLeftPagesRX - READING_PAGE_BLOCK_INSET_RX,
				open,
			);
		}

		if (rightPageBlockPivot) {
			const restRightPagesRX = getRest(rightPageBlockPivot, "rx");
			rightPageBlockPivot.rotation.x = lerp(
				restRightPagesRX,
				restRightPagesRX + READING_PAGE_BLOCK_INSET_RX,
				open,
			);
		}

		if (middlePageFanPivot) {
			middlePageFanPivot.rotation.x = 0;
		}

		if (frontCoverPivot) {
			const restCoverRX = getRest(frontCoverPivot, "rx");
			frontCoverPivot.rotation.x = lerp(restCoverRX, restCoverRX - READING_COVER_OPEN_RX, open);
		}

		const loosePageCount = loosePages.length;
		for (let i = 0; i < loosePageCount; i++) {
			const leaf = loosePages[i];
			const restLeafRX = getRest(leaf, "rx");
			const t = loosePageCount <= 1 ? 0.5 : i / (loosePageCount - 1);
			const angle = lerp(READING_LOOSE_PAGE_EDGE_RX, -READING_LOOSE_PAGE_EDGE_RX, t);
			const centered = 1 - Math.abs(t * 2 - 1);
			const flutter =
				Math.sin(riffle * Math.PI * (2.5 + i * 0.14)) * (0.003 + centered * 0.003) * (1 - riffle);
			leaf.rotation.x = lerp(restLeafRX, restLeafRX + angle, open) + flutter * open;
		}
	});
}

export function animateBookClose(stack: Object3D): Promise<void> {
	const books = stack.children
		.filter((child) => child.userData?.bookItem)
		.sort((a, b) => (a.userData?.bookIndex ?? 0) - (b.userData?.bookIndex ?? 0));
	const hero = books.find((child) => child.userData?.heroBook);
	if (!hero) return Promise.resolve();

	const backCoverPivot = findChild(hero, "backCoverPivot");
	const leftPageBlockPivot = findChild(hero, "leftPageBlockPivot");
	const rightPageBlockPivot = findChild(hero, "rightPageBlockPivot");
	const middlePageFanPivot = findChild(hero, "middlePageFanPivot");
	const frontCoverPivot = findChild(hero, "frontCoverPivot");
	const loosePages = findChildren(hero, "loosePagePivot").sort(
		(a, b) => (a.userData?.loosePageIndex ?? 0) - (b.userData?.loosePageIndex ?? 0),
	);
	const poses = books.map((book) => ({
		book,
		x: book.position.x,
		y: book.position.y,
		z: book.position.z,
		rx: book.rotation.x,
		ry: book.rotation.y,
		rz: book.rotation.z,
	}));
	const backCoverRX = backCoverPivot?.rotation.x ?? 0;
	const leftPagesRX = leftPageBlockPivot?.rotation.x ?? 0;
	const rightPagesRX = rightPageBlockPivot?.rotation.x ?? 0;
	const middleFanRX = middlePageFanPivot?.rotation.x ?? 0;
	const coverRX = frontCoverPivot?.rotation.x ?? 0;
	const looseLeafRotations = loosePages.map((leaf) => ({ leaf, rx: leaf.rotation.x }));

	saveRest(hero, "x", hero.position.x);
	saveRest(hero, "y", hero.position.y);
	saveRest(hero, "z", hero.position.z);
	saveRest(hero, "rx", hero.rotation.x);
	saveRest(hero, "ry", hero.rotation.y);
	saveRest(hero, "rz", hero.rotation.z);
	for (const book of books) {
		saveRest(book, "x", book.position.x);
		saveRest(book, "y", book.position.y);
		saveRest(book, "z", book.position.z);
		saveRest(book, "rx", book.rotation.x);
		saveRest(book, "ry", book.rotation.y);
		saveRest(book, "rz", book.rotation.z);
	}
	if (backCoverPivot) {
		saveRest(backCoverPivot, "rx", backCoverPivot.rotation.x);
	}
	if (leftPageBlockPivot) {
		saveRest(leftPageBlockPivot, "rx", leftPageBlockPivot.rotation.x);
	}
	if (rightPageBlockPivot) {
		saveRest(rightPageBlockPivot, "rx", rightPageBlockPivot.rotation.x);
	}
	if (middlePageFanPivot) {
		saveRest(middlePageFanPivot, "rx", middlePageFanPivot.rotation.x);
	}
	if (frontCoverPivot) {
		saveRest(frontCoverPivot, "rx", frontCoverPivot.rotation.x);
	}
	for (const leaf of loosePages) {
		saveRest(leaf, "rx", leaf.rotation.x);
	}

	return animate(`book-${stack.uuid}`, READING_CLOSE_DURATION_MS, (p) => {
		const pageSettle = easeInOutCubic(clamp(p / 0.42, 0, 1));
		const blockSettle = easeInOutCubic(clamp((p - 0.02) / 0.4, 0, 1));
		const coverSettle = easeInOutCubic(clamp((p - 0.03) / 0.44, 0, 1));
		const poseReturn = easeInOutCubic(clamp((p - 0.5) / 0.5, 0, 1));

		for (const pose of poses) {
			pose.book.position.x = lerp(pose.x, getRest(pose.book, "x"), poseReturn);
			pose.book.position.y = lerp(pose.y, getRest(pose.book, "y"), poseReturn);
			pose.book.position.z = lerp(pose.z, getRest(pose.book, "z"), poseReturn);
			pose.book.rotation.x = lerp(pose.rx, getRest(pose.book, "rx"), poseReturn);
			pose.book.rotation.y = lerp(pose.ry, getRest(pose.book, "ry"), poseReturn);
			pose.book.rotation.z = lerp(pose.rz, getRest(pose.book, "rz"), poseReturn);
		}
		if (backCoverPivot) {
			backCoverPivot.rotation.x = lerp(backCoverRX, getRest(backCoverPivot, "rx"), coverSettle);
		}
		if (leftPageBlockPivot) {
			leftPageBlockPivot.rotation.x = lerp(
				leftPagesRX,
				getRest(leftPageBlockPivot, "rx"),
				blockSettle,
			);
		}
		if (rightPageBlockPivot) {
			rightPageBlockPivot.rotation.x = lerp(
				rightPagesRX,
				getRest(rightPageBlockPivot, "rx"),
				blockSettle,
			);
		}
		if (middlePageFanPivot) {
			middlePageFanPivot.rotation.x = lerp(
				middleFanRX,
				getRest(middlePageFanPivot, "rx"),
				pageSettle,
			);
		}
		if (frontCoverPivot) {
			frontCoverPivot.rotation.x = lerp(coverRX, getRest(frontCoverPivot, "rx"), coverSettle);
		}
		for (const leaf of looseLeafRotations) {
			leaf.leaf.rotation.x = lerp(leaf.rx, getRest(leaf.leaf, "rx"), pageSettle);
		}
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

/** Tip shelf items forward and drop them off the shelf before opening */
export function animateShelfPresent(items: Object3D): Promise<void> {
	saveRest(items, "x", items.position.x);
	saveRest(items, "y", items.position.y);
	saveRest(items, "z", items.position.z);
	saveRest(items, "rx", items.rotation.x);
	saveRest(items, "ry", items.rotation.y);
	saveRest(items, "rz", items.rotation.z);
	const restX = getRest(items, "x");
	const restY = getRest(items, "y");
	const restZ = getRest(items, "z");
	const restRX = getRest(items, "rx");
	const restRY = getRest(items, "ry");
	const restRZ = getRest(items, "rz");
	return animate(`shelf-present-${items.uuid}`, 280, (p) => {
		items.position.x = lerp(restX, restX - 0.7, p);
		items.position.y = lerp(restY, restY - 1.45, p);
		items.position.z = lerp(restZ, restZ + 0.12, p);
		items.rotation.x = lerp(restRX, restRX - 0.55, p);
		items.rotation.y = lerp(restRY, restRY + 0.12, p);
		items.rotation.z = lerp(restRZ, restRZ + 0.3, p);
	});
}

/** Return shelf items to rest position */
export function animateShelfReset(items: Object3D): Promise<void> {
	const curX = items.position.x;
	const curY = items.position.y;
	const curZ = items.position.z;
	const curRX = items.rotation.x;
	const curRY = items.rotation.y;
	const curRZ = items.rotation.z;
	const restX = getRest(items, "x");
	const restY = getRest(items, "y");
	const restZ = getRest(items, "z");
	const restRX = getRest(items, "rx");
	const restRY = getRest(items, "ry");
	const restRZ = getRest(items, "rz");
	return animate(`shelf-present-${items.uuid}`, 320, (p) => {
		items.position.x = lerp(curX, restX, p);
		items.position.y = lerp(curY, restY, p);
		items.position.z = lerp(curZ, restZ, p);
		items.rotation.x = lerp(curRX, restRX, p);
		items.rotation.y = lerp(curRY, restRY, p);
		items.rotation.z = lerp(curRZ, restRZ, p);
	});
}
