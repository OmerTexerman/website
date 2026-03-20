import { MeshStandardMaterial, type Object3D, Vector3 } from "three";
import { clamp, lerp } from "./math-utils";
import type { BookStackObject } from "./objects/book-stack";
import type { DictionaryObject } from "./objects/dictionary";
import type { LaptopObject } from "./objects/laptop";
import type { NotebookObject } from "./objects/notebook";
import type { PhotoFrameObject } from "./objects/photo-frame";

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

function saveRestPose(obj: Object3D): void {
	saveRest(obj, "x", obj.position.x);
	saveRest(obj, "y", obj.position.y);
	saveRest(obj, "z", obj.position.z);
	saveRest(obj, "rx", obj.rotation.x);
	saveRest(obj, "ry", obj.rotation.y);
	saveRest(obj, "rz", obj.rotation.z);
}

function getRestPose(obj: Object3D): {
	x: number;
	y: number;
	z: number;
	rx: number;
	ry: number;
	rz: number;
} {
	return {
		x: getRest(obj, "x"),
		y: getRest(obj, "y"),
		z: getRest(obj, "z"),
		rx: getRest(obj, "rx"),
		ry: getRest(obj, "ry"),
		rz: getRest(obj, "rz"),
	};
}

const DESKTOP_CAMERA_WORLD_POS = new Vector3(0, 5, 7);
const _cameraLocalPos = new Vector3();

// ─── NOTEBOOK (Blog) ─────────────────────────────────────────────
export function animateNotebookOpen(notebook: NotebookObject): Promise<void> {
	const pivot = notebook.parts.coverPivot;
	saveRest(pivot, "rx", pivot.rotation.x);
	const rest = getRest(pivot, "rx");
	return animate(`notebook-${notebook.root.uuid}`, 600, (p) => {
		pivot.rotation.x = lerp(rest, rest - 2.8, p);
	});
}

export function animateNotebookClose(notebook: NotebookObject): Promise<void> {
	const pivot = notebook.parts.coverPivot;
	const current = pivot.rotation.x;
	const rest = getRest(pivot, "rx");
	return animate(`notebook-${notebook.root.uuid}`, 400, (p) => {
		pivot.rotation.x = lerp(current, rest, p);
	});
}

// ─── LAPTOP (Projects) ──────────────────────────────────────────
export function animateLaptopOpen(laptop: LaptopObject): Promise<void> {
	const { screenGroup, screenFace, screenLight } = laptop.parts;
	saveRest(screenGroup, "rx", screenGroup.rotation.x);
	const rest = getRest(screenGroup, "rx");

	const faceMat = screenFace.material instanceof MeshStandardMaterial ? screenFace.material : null;
	let restEmissive = 0;
	if (faceMat) {
		saveRest(screenFace, "emissive", faceMat.emissiveIntensity);
		restEmissive = getRest(screenFace, "emissive");
	}

	const restLightIntensity = screenLight.intensity;

	return animate(`laptop-${laptop.root.uuid}`, 500, (p) => {
		screenGroup.rotation.x = lerp(rest, rest - 0.91, p);
		if (faceMat) faceMat.emissiveIntensity = lerp(restEmissive, 8.0, p);
		screenLight.intensity = lerp(restLightIntensity, 8.0, p);
	});
}

export function animateLaptopClose(laptop: LaptopObject): Promise<void> {
	const { screenGroup, screenFace, screenLight } = laptop.parts;
	const current = screenGroup.rotation.x;
	const rest = getRest(screenGroup, "rx");

	const faceMat = screenFace.material instanceof MeshStandardMaterial ? screenFace.material : null;
	const curEmissive = faceMat?.emissiveIntensity ?? 0;
	const restEmissive = faceMat ? getRest(screenFace, "emissive") : 0;
	const curLightIntensity = screenLight.intensity;

	return animate(`laptop-${laptop.root.uuid}`, 400, (p) => {
		screenGroup.rotation.x = lerp(current, rest, p);
		if (faceMat) faceMat.emissiveIntensity = lerp(curEmissive, restEmissive, p);
		screenLight.intensity = lerp(curLightIntensity, 2.0, p);
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

export function animateBookLift(stack: BookStackObject): Promise<void> {
	const {
		hero,
		lowerBooks,
		backCoverPivot,
		leftPageBlockPivot,
		rightPageBlockPivot,
		middlePageFanPivot,
		frontCoverPivot,
		loosePagePivots,
	} = stack.parts;
	if (!hero) return Promise.resolve();

	saveRestPose(hero);
	for (const book of lowerBooks) {
		saveRestPose(book);
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
	for (const leaf of loosePagePivots) {
		saveRest(leaf, "rx", leaf.rotation.x);
	}

	return animate(`book-${stack.root.uuid}`, READING_OPEN_DURATION_MS, (p) => {
		const lift = easeInOutCubic(clamp(p / 0.28, 0, 1));
		const present = easeInOutCubic(clamp((p - 0.12) / 0.28, 0, 1));
		const open = easeInOutCubic(clamp((p - 0.34) / 0.38, 0, 1));
		const riffle = clamp((p - 0.62) / 0.2, 0, 1);

		const { x: restX, y: restY, z: restZ, rx: restRX, ry: restRY, rz: restRZ } = getRestPose(hero);

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

		const loosePageCount = loosePagePivots.length;
		for (let i = 0; i < loosePageCount; i++) {
			const leaf = loosePagePivots[i];
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

export function animateBookClose(stack: BookStackObject): Promise<void> {
	const {
		books,
		hero,
		backCoverPivot,
		leftPageBlockPivot,
		rightPageBlockPivot,
		middlePageFanPivot,
		frontCoverPivot,
		loosePagePivots,
	} = stack.parts;
	if (!hero) return Promise.resolve();
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
	const looseLeafRotations = loosePagePivots.map((leaf) => ({ leaf, rx: leaf.rotation.x }));

	saveRestPose(hero);
	for (const book of books) {
		saveRestPose(book);
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
	for (const leaf of loosePagePivots) {
		saveRest(leaf, "rx", leaf.rotation.x);
	}

	return animate(`book-${stack.root.uuid}`, READING_CLOSE_DURATION_MS, (p) => {
		const pageSettle = easeInOutCubic(clamp(p / 0.42, 0, 1));
		const blockSettle = easeInOutCubic(clamp((p - 0.02) / 0.4, 0, 1));
		const coverSettle = easeInOutCubic(clamp((p - 0.03) / 0.44, 0, 1));
		const poseReturn = easeInOutCubic(clamp((p - 0.5) / 0.5, 0, 1));

		for (const pose of poses) {
			const rest = getRestPose(pose.book);
			pose.book.position.x = lerp(pose.x, rest.x, poseReturn);
			pose.book.position.y = lerp(pose.y, rest.y, poseReturn);
			pose.book.position.z = lerp(pose.z, rest.z, poseReturn);
			pose.book.rotation.x = lerp(pose.rx, rest.rx, poseReturn);
			pose.book.rotation.y = lerp(pose.ry, rest.ry, poseReturn);
			pose.book.rotation.z = lerp(pose.rz, rest.rz, poseReturn);
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

export function animateFrameReveal(frame: PhotoFrameObject): Promise<void> {
	const photo = frame.parts.flyPhoto;

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
	const sceneRoot = frame.root.parent;
	if (!sceneRoot) return Promise.resolve();
	frame.root.remove(photo);
	photo.position.set(startWorld.x, startWorld.y, startWorld.z);
	photo.rotation.set(0, 0, startRotZ);
	photo.scale.set(1, 1, 1);
	sceneRoot.add(photo);

	flyingPhotoData = { photo, frame: frame.root, startWorld, restLocal };

	return animate(`frame-${frame.root.uuid}`, 800, (p) => {
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
		photo.rotation.x = lerp(frame.root.rotation.x, 0, p);
		const s = lerp(1, 3.0, p);
		photo.scale.set(s, s, s);
	});
}

export function animateFrameClose(frame: PhotoFrameObject): Promise<void> {
	if (!flyingPhotoData || flyingPhotoData.frame !== frame.root) return Promise.resolve();
	const { photo, startWorld, restLocal } = flyingPhotoData;
	const curPos = { x: photo.position.x, y: photo.position.y, z: photo.position.z };
	const curRotZ = photo.rotation.z;
	const curRotX = photo.rotation.x;
	const curScale = photo.scale.x;
	const saved = flyingPhotoData;

	return animate(`frame-${frame.root.uuid}`, 500, (p) => {
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
			frame.root.add(photo);
			if (saved === flyingPhotoData) flyingPhotoData = null;
		}
	});
}

// ─── DICTIONARY (Word of the Day) ────────────────────────────────
// Cover opens wide, pages cascade with "spine shoulder" arc —
// each page's pivot temporarily lifts (+Y) and pushes out (+X)
// at mid-turn so it appears to curve around the spine binding.
const DICT_OPEN_MS = 1100;
const DICT_CLOSE_MS = 550;
const DICT_COVER_ANGLE = 2.9;
const DICT_LEFT_BLOCK_SWEEP = 0;
const DICT_LEFT_BLOCK_CURVE = 0.52;
const DICT_LEFT_BLOCK_MAX_SCALE = 0.56;
const DICT_RIGHT_BLOCK_MIN_SCALE = 0.68;
const DICT_LEAF_OPEN_START = 0.25;
const DICT_LEAF_STAGGER = 0.04;
const DICT_LEAF_DURATION = 0.45;
const DICT_LEFT_PACKET_START = 0.44;
const DICT_LEFT_PACKET_DURATION = 0.28;
// Elastica-inspired page shape using rational angle remap.
// θ(t) = θ_A + (θ_B - θ_A) * (β*t)/(β*t + (1-t))
// β controls spine sharpness: higher = sharper departure at spine.
// θ_A = departure angle from spine, θ_B = cover surface angle.
// Pages leave the spine HORIZONTALLY (pointing right, along the page
// surface). θ_A ≈ 0 means pointing right. They then curve up and over
// to θ_B = 2.9 rad (the open cover direction) — a ~166° sweep.
const DICT_THETA_A = 0; // horizontal — perpendicular to spine
const DICT_BETA_INNER = 3.5; // inner pages: sharp curve at spine
const DICT_BETA_OUTER = 1.8; // outer pages: gentle curve

function getDictionaryPacketCurveProfile(jointCount: number): number[] {
	if (jointCount <= 0) return [];

	const profile: number[] = [];
	let maxAbs = 0;
	let prevTangent = 0;
	for (let i = 0; i < jointCount; i++) {
		const t = jointCount <= 1 ? 1 : i / Math.max(jointCount - 1, 1);
		let tangent = 0;
		if (t < 0.24) {
			tangent = Math.sin((t / 0.24) * (Math.PI / 2)) * 1.08;
		} else if (t < 0.58) {
			tangent = Math.cos(((t - 0.24) / 0.34) * (Math.PI / 2)) * 1.08;
		}
		const delta = tangent - prevTangent;
		profile.push(delta);
		maxAbs = Math.max(maxAbs, Math.abs(delta));
		prevTangent = tangent;
	}

	return maxAbs > 0 ? profile.map((value) => value / maxAbs) : profile;
}

export function animateDictionaryOpen(dict: DictionaryObject): Promise<void> {
	const {
		frontCoverPivot,
		leftPageBlockPivot,
		leftPageBlockGroup,
		leftPageBlockCurveJoints,
		pageLeaves,
		basePageBlock,
		staticEdgeDetailGroup,
	} = dict.parts;

	saveRest(frontCoverPivot, "rz", frontCoverPivot.rotation.z);
	saveRest(leftPageBlockPivot, "rz", leftPageBlockPivot.rotation.z);
	saveRest(leftPageBlockGroup, "sy", leftPageBlockGroup.scale.y);
	saveRest(leftPageBlockGroup, "y", leftPageBlockGroup.position.y);
	for (const joint of leftPageBlockCurveJoints) {
		saveRest(joint, "rz", joint.rotation.z);
	}
	saveRest(basePageBlock, "sy", basePageBlock.scale.y);
	saveRest(basePageBlock, "y", basePageBlock.position.y);
	for (const { flipPivot, curveJoints } of pageLeaves) {
		saveRest(flipPivot, "rz", flipPivot.rotation.z);
		saveRest(flipPivot, "x", flipPivot.position.x);
		saveRest(flipPivot, "y", flipPivot.position.y);
		for (const joint of curveJoints) {
			saveRest(joint, "rz", joint.rotation.z);
		}
	}

	const restCover = getRest(frontCoverPivot, "rz");
	const restLeftPivotRZ = getRest(leftPageBlockPivot, "rz");
	const restLeftBlockScaleY = getRest(leftPageBlockGroup, "sy");
	const restLeftBlockY = getRest(leftPageBlockGroup, "y");
	const leftBlockCurveProfile = getDictionaryPacketCurveProfile(leftPageBlockCurveJoints.length);
	const restBlockScaleY = getRest(basePageBlock, "sy");
	const restBlockY = getRest(basePageBlock, "y");
	const n = pageLeaves.length;

	return animate(`dict-${dict.root.uuid}`, DICT_OPEN_MS, (p) => {
		const coverP = easeInOutCubic(clamp(p / 0.55, 0, 1));
		const riffleP = easeInOutCubic(clamp((p - 0.22) / 0.68, 0, 1));
		const leftPacketP = easeInOutCubic(
			clamp((p - DICT_LEFT_PACKET_START) / DICT_LEFT_PACKET_DURATION, 0, 1),
		);
		frontCoverPivot.rotation.z = lerp(restCover, restCover + DICT_COVER_ANGLE, coverP);

		leftPageBlockPivot.visible = false; // disabled — individual pages handle the left side now
		leftPageBlockPivot.rotation.z = lerp(
			restLeftPivotRZ,
			restLeftPivotRZ + DICT_LEFT_BLOCK_SWEEP,
			leftPacketP,
		);
		const leftScale = Math.max(
			0.02,
			restLeftBlockScaleY * lerp(0.02, DICT_LEFT_BLOCK_MAX_SCALE, leftPacketP),
		);
		leftPageBlockGroup.scale.y = leftScale;
		leftPageBlockGroup.position.y = restLeftBlockY;
		for (let jointIndex = 0; jointIndex < leftPageBlockCurveJoints.length; jointIndex++) {
			const joint = leftPageBlockCurveJoints[jointIndex];
			const restRZ = getRest(joint, "rz");
			joint.rotation.z = lerp(
				restRZ,
				restRZ + DICT_LEFT_BLOCK_CURVE * leftBlockCurveProfile[jointIndex],
				leftPacketP,
			);
		}

		// ── Straight → Arc → Straight model ─────────────────────────
		// Each page is modeled as: straight rise from pivot P toward
		// the spine arc, circular arc of radius R_i around the spine,
		// then straight flat in the cover direction.
		//
		// R_i = R_0 + i * t — inner pages wrap tighter, outer pages gentler.
		// The tangent direction at any arc-length position s is computed
		// from the continuous path, then discretized onto segment joints.
		for (let i = 0; i < n; i++) {
			const { flipPivot, curveJoints } = pageLeaves[i];
			const restRZ = getRest(flipPivot, "rz");
			const restX = getRest(flipPivot, "x");
			const restY = getRest(flipPivot, "y");

			const t = n <= 1 ? 0.5 : i / (n - 1);
			const delay = DICT_LEAF_OPEN_START + t * DICT_LEAF_STAGGER * (n - 1);
			const leafPhase = clamp((p - delay) / DICT_LEAF_DURATION, 0, 1);
			const leafTravel = easeInOutCubic(clamp((leafPhase - 0.06) / 0.8, 0, 1));

			if (leafPhase <= 0.001) {
				continue;
			}

			// Show page once it starts flipping
			flipPivot.visible = true;

			// ── Elastica-inspired rational angle remap ───────────────
			// θ(t) = θ_A + (θ_B - θ_A) * h(t)
			// h(t) = (β*t) / (β*t + (1-t))
			//
			// This smoothly interpolates the page angle from spine
			// departure (θ_A) to cover surface (θ_B). The parameter β
			// controls how sharply the page curves at the spine:
			// higher β = more curvature concentrated near spine.
			// Inner pages get higher β (sharper), outer get lower.
			const pageT = n <= 1 ? 0.5 : i / (n - 1);
			const beta = lerp(DICT_BETA_INNER, DICT_BETA_OUTER, pageT);
			// θ_B overshoots past cover angle so pages droop dramatically
			// down onto it — the tip section curves down to rest on the cover
			const thetaB = DICT_COVER_ANGLE + 1.0;

			// flipPivot sets the departure angle — horizontal (0)
			flipPivot.rotation.z = restRZ + DICT_THETA_A * leafTravel;

			// Compute per-joint angles. The page angle follows the rational
			// remap from θ_A toward the overshoot θ_B, but the LAST portion
			// of the page curves BACK to the cover angle — creating the
			// drape shape: up, over, down past cover, then tip rests flat.
			const jCount = curveJoints.length;
			const coverAngleRel = DICT_COVER_ANGLE - DICT_THETA_A;
			const overshootRel = thetaB - DICT_THETA_A;

			for (let j = 0; j < jCount; j++) {
				const joint = curveJoints[j];
				const restJRZ = getRest(joint, "rz");

				const tHere = (j + 1) / jCount;
				const tPrev = j / jCount;

				// Rational remap gives the main curve (spine → overshoot)
				const hHere = (beta * tHere) / (beta * tHere + (1 - tHere));
				const hPrev = (beta * tPrev) / (beta * tPrev + (1 - tPrev));

				// Blend: remap drives the first 70%, then we ease back
				// to the cover angle for the last 30% (the tip rests flat)
				const blendStart = 0.65;
				let angleHere: number;
				let anglePrev: number;

				if (tHere <= blendStart) {
					angleHere = overshootRel * hHere;
				} else {
					const remapAt = (beta * blendStart) / (beta * blendStart + (1 - blendStart));
					const peakAngle = overshootRel * remapAt;
					const blendT = (tHere - blendStart) / (1 - blendStart);
					// Ease from peak back to cover angle
					const eased = blendT * blendT * (3 - 2 * blendT); // smoothstep
					angleHere = lerp(peakAngle, coverAngleRel, eased);
				}

				if (tPrev <= blendStart) {
					anglePrev = overshootRel * hPrev;
				} else {
					const remapAt = (beta * blendStart) / (beta * blendStart + (1 - blendStart));
					const peakAngle = overshootRel * remapAt;
					const blendT = (tPrev - blendStart) / (1 - blendStart);
					const eased = blendT * blendT * (3 - 2 * blendT);
					anglePrev = lerp(peakAngle, coverAngleRel, eased);
				}

				const bend = angleHere - anglePrev;
				joint.rotation.z = restJRZ + bend * leafTravel;
			}

			flipPivot.position.x = restX;
			flipPivot.position.y = restY;
		}

		const rightScale = restBlockScaleY * lerp(1, DICT_RIGHT_BLOCK_MIN_SCALE, riffleP);
		basePageBlock.scale.y = rightScale;
		basePageBlock.position.y = restBlockY * rightScale;
		staticEdgeDetailGroup.visible = false;
	});
}

export function animateDictionaryClose(dict: DictionaryObject): Promise<void> {
	const {
		frontCoverPivot,
		leftPageBlockPivot,
		leftPageBlockGroup,
		leftPageBlockCurveJoints,
		pageLeaves,
		basePageBlock,
	} = dict.parts;

	const curCover = frontCoverPivot.rotation.z;
	const restCover = getRest(frontCoverPivot, "rz");
	const curLeftPivotRZ = leftPageBlockPivot.rotation.z;
	const restLeftPivotRZ = getRest(leftPageBlockPivot, "rz");
	const curLeftBlockScaleY = leftPageBlockGroup.scale.y;
	const restLeftBlockScaleY = getRest(leftPageBlockGroup, "sy");
	const curLeftBlockY = leftPageBlockGroup.position.y;
	const restLeftBlockY = getRest(leftPageBlockGroup, "y");
	const leftBlockCurveStates = leftPageBlockCurveJoints.map((joint) => ({
		joint,
		curRZ: joint.rotation.z,
		restRZ: getRest(joint, "rz"),
	}));
	const curBlockScaleY = basePageBlock.scale.y;
	const restBlockScaleY = getRest(basePageBlock, "sy");
	const curBlockY = basePageBlock.position.y;
	const restBlockY = getRest(basePageBlock, "y");
	const leafStates = pageLeaves.map(({ flipPivot, curveJoints }) => ({
		flipPivot,
		curRZ: flipPivot.rotation.z,
		restRZ: getRest(flipPivot, "rz"),
		curX: flipPivot.position.x,
		restX: getRest(flipPivot, "x"),
		curY: flipPivot.position.y,
		restY: getRest(flipPivot, "y"),
		jointStates: curveJoints.map((joint) => ({
			joint,
			curRZ: joint.rotation.z,
			restRZ: getRest(joint, "rz"),
		})),
	}));

	const nLeaves = leafStates.length;

	return animate(`dict-${dict.root.uuid}`, DICT_CLOSE_MS, (p) => {
		// Pages close in reverse stagger — last opened page closes first
		for (let i = 0; i < nLeaves; i++) {
			const s = leafStates[i];
			// Reverse stagger: page i closes at a delay proportional to (n-1-i)
			const reverseT = nLeaves <= 1 ? 0 : (nLeaves - 1 - i) / (nLeaves - 1);
			const delay = reverseT * 0.3;
			const pageP = easeInOutCubic(clamp((p - delay) / 0.5, 0, 1));

			s.flipPivot.rotation.z = lerp(s.curRZ, s.restRZ, pageP);
			s.flipPivot.position.x = lerp(s.curX, s.restX, pageP);
			s.flipPivot.position.y = lerp(s.curY, s.restY, pageP);
			for (const jointState of s.jointStates) {
				jointState.joint.rotation.z = lerp(jointState.curRZ, jointState.restRZ, pageP);
			}
			// Hide once fully returned to rest
			if (pageP >= 0.99) s.flipPivot.visible = false;
		}

		leftPageBlockPivot.visible = false;
		basePageBlock.scale.y = lerp(curBlockScaleY, restBlockScaleY, easeInOutCubic(p));
		basePageBlock.position.y = lerp(curBlockY, restBlockY, easeInOutCubic(p));

		const coverP = easeInOutCubic(clamp((p - 0.4) / 0.55, 0, 1));
		frontCoverPivot.rotation.z = lerp(curCover, restCover, coverP);
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
	saveRestPose(items);
	const { x: restX, y: restY, z: restZ, rx: restRX, ry: restRY, rz: restRZ } = getRestPose(items);
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
	const { x: restX, y: restY, z: restZ, rx: restRX, ry: restRY, rz: restRZ } = getRestPose(items);
	return animate(`shelf-present-${items.uuid}`, 320, (p) => {
		items.position.x = lerp(curX, restX, p);
		items.position.y = lerp(curY, restY, p);
		items.position.z = lerp(curZ, restZ, p);
		items.rotation.x = lerp(curRX, restRX, p);
		items.rotation.y = lerp(curRY, restRY, p);
		items.rotation.z = lerp(curRZ, restRZ, p);
	});
}
