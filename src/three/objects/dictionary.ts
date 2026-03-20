import {
	BoxGeometry,
	Color,
	CylinderGeometry,
	DoubleSide,
	Group,
	Mesh,
	MeshStandardMaterial,
	PlaneGeometry,
} from "three";
import { DICTIONARY_GOLD } from "../colors";
import { applySectionInteraction } from "../interactive-section";
import {
	dictionaryGoldMaterial,
	dictionaryLeatherMaterial,
	dictionaryPagesMaterial,
} from "../materials";
import { DESK_SURFACE_Y } from "../math-utils";

export interface DictionaryObject {
	root: Group;
	parts: {
		/** Cover pivots at the left-side spine. Rotates around Z to swing right. */
		coverPivot: Group;
		/** Page pivots at spine for flip animation. Rotate around Z. */
		pageFlips: Group[];
	};
}

// Lying flat dimensions
const WIDTH = 0.6; // X — left to right
const THICKNESS = 0.16; // Y — height when flat
const DEPTH = 0.75; // Z — front to back
const COVER_THICK = 0.015;
const PAGES_H = THICKNESS - COVER_THICK * 2;
const PAGE_FLIP_COUNT = 8;
const TAB_LETTERS = ["A", "D", "G", "K", "N", "R", "T", "W"];

/** Dictionary → links to /word-of-the-day
 *
 *  Lies flat on the desk. Spine runs along the LEFT side (−X).
 *  Cover opens by swinging to the RIGHT (+X) via rotation.z,
 *  giving a completely different motion from the notebook.
 *  Thumb index tabs along the fore-edge (+X, right side).
 */
export function createDictionary(): DictionaryObject {
	const dictionary = new Group();
	applySectionInteraction(dictionary, "wordOfTheDay");

	// ─── Bottom cover ────────────────────────────────────────────
	const bottomCover = new Mesh(
		new BoxGeometry(WIDTH, COVER_THICK, DEPTH),
		dictionaryLeatherMaterial,
	);
	bottomCover.position.set(0, COVER_THICK / 2, 0);
	bottomCover.castShadow = true;
	dictionary.add(bottomCover);

	// ─── Page block ──────────────────────────────────────────────
	const pageBlock = new Mesh(
		new BoxGeometry(WIDTH - 0.02, PAGES_H, DEPTH - 0.02),
		dictionaryPagesMaterial,
	);
	pageBlock.position.set(0, COVER_THICK + PAGES_H / 2, 0);
	dictionary.add(pageBlock);

	// ─── Thumb index tabs along the right edge (+X, fore-edge) ───
	const tabDepth = (DEPTH - 0.04) / TAB_LETTERS.length;
	const tabRadius = 0.022;
	for (let i = 0; i < TAB_LETTERS.length; i++) {
		const z = -DEPTH / 2 + 0.02 + tabDepth * i + tabDepth / 2;
		const y = COVER_THICK + PAGES_H / 2;

		// Semi-circle tab protruding from right edge
		const tabGeo = new CylinderGeometry(tabRadius, tabRadius, 0.005, 8);
		const tabMat = new MeshStandardMaterial({
			color: new Color("#c4b898"),
			roughness: 0.9,
		});
		const tab = new Mesh(tabGeo, tabMat);
		tab.rotation.z = Math.PI / 2;
		tab.position.set(WIDTH / 2 - 0.005, y, z);
		dictionary.add(tab);
	}

	// ─── Page-edge lines on the right edge and front edge ────────
	const edgeMat = new MeshStandardMaterial({ color: new Color("#d8d0c0"), roughness: 1.0 });
	for (let i = 0; i < 10; i++) {
		const t = (i + 1) / 11;
		const y = COVER_THICK + PAGES_H * t;
		// Right edge (+X)
		const rightEdge = new Mesh(new BoxGeometry(0.001, 0.0008, DEPTH - 0.04), edgeMat);
		rightEdge.position.set(WIDTH / 2 - 0.012, y, 0);
		dictionary.add(rightEdge);
		// Front edge (+Z)
		const frontEdge = new Mesh(new BoxGeometry(WIDTH - 0.04, 0.0008, 0.001), edgeMat);
		frontEdge.position.set(0, y, DEPTH / 2 - 0.012);
		dictionary.add(frontEdge);
	}

	// ─── Spine along the left edge (−X) ──────────────────────────
	const spineRadius = COVER_THICK * 1.2;
	const spineGeo = new CylinderGeometry(
		spineRadius,
		spineRadius,
		DEPTH - 0.01,
		8,
		1,
		false,
		0,
		Math.PI,
	);
	const spine = new Mesh(spineGeo, dictionaryLeatherMaterial);
	// Cylinder runs along Y by default; rotate so it runs along Z (depth)
	spine.rotation.x = Math.PI / 2;
	spine.rotation.z = -Math.PI / 2;
	spine.position.set(-WIDTH / 2 + 0.003, COVER_THICK + PAGES_H / 2, 0);
	dictionary.add(spine);

	// ─── Top cover — pivots at left-side spine ───────────────────
	// Pivot is at the left edge (x = -WIDTH/2), top of pages.
	// rotation.z swings the cover open to the right.
	const coverPivot = new Group();
	coverPivot.position.set(-WIDTH / 2, COVER_THICK + PAGES_H, 0);
	dictionary.add(coverPivot);

	const topCover = new Mesh(new BoxGeometry(WIDTH, COVER_THICK, DEPTH), dictionaryLeatherMaterial);
	// Cover extends to the right from the pivot
	topCover.position.set(WIDTH / 2, COVER_THICK / 2, 0);
	topCover.castShadow = true;
	coverPivot.add(topCover);

	// Gold border frame on top cover
	const borderMat = new MeshStandardMaterial({
		color: new Color(DICTIONARY_GOLD),
		roughness: 0.3,
		metalness: 0.55,
		transparent: true,
		opacity: 0.45,
		side: DoubleSide,
	});
	const border = new Mesh(new PlaneGeometry(WIDTH - 0.06, DEPTH - 0.06), borderMat);
	border.rotation.x = -Math.PI / 2;
	border.position.set(WIDTH / 2, COVER_THICK + 0.001, 0);
	coverPivot.add(border);

	// Gold title bar
	const titleBar = new Mesh(new PlaneGeometry(WIDTH * 0.5, 0.04), dictionaryGoldMaterial);
	titleBar.rotation.x = -Math.PI / 2;
	titleBar.position.set(WIDTH / 2, COVER_THICK + 0.002, -DEPTH * 0.08);
	coverPivot.add(titleBar);

	// Subtitle line
	const subtitle = new Mesh(new PlaneGeometry(WIDTH * 0.3, 0.015), dictionaryGoldMaterial);
	subtitle.rotation.x = -Math.PI / 2;
	subtitle.position.set(WIDTH / 2, COVER_THICK + 0.002, DEPTH * 0.06);
	coverPivot.add(subtitle);

	// Gold corner ornaments
	const cornerSize = 0.03;
	const cornerGeo = new PlaneGeometry(cornerSize, cornerSize);
	for (const [cx, cz] of [
		[0.04, -DEPTH / 2 + 0.04],
		[WIDTH - 0.04, -DEPTH / 2 + 0.04],
		[0.04, DEPTH / 2 - 0.04],
		[WIDTH - 0.04, DEPTH / 2 - 0.04],
	]) {
		const corner = new Mesh(cornerGeo, dictionaryGoldMaterial);
		corner.rotation.x = -Math.PI / 2;
		corner.rotation.z = Math.PI / 4;
		corner.position.set(cx, COVER_THICK + 0.0015, cz);
		coverPivot.add(corner);
	}

	// ─── Page flips (pivot at left-side spine, rotate Z) ─────────
	const pageFlips: Group[] = [];
	for (let i = 0; i < PAGE_FLIP_COUNT; i++) {
		const pagePivot = new Group();
		// Pivot at the spine (left edge)
		pagePivot.position.set(-WIDTH / 2 + 0.01, COVER_THICK + PAGES_H * 0.5, 0);
		dictionary.add(pagePivot);

		const pageMat = new MeshStandardMaterial({
			color: new Color("#f0e8d8"),
			roughness: 1.0,
			side: DoubleSide,
			transparent: true,
			opacity: 0.85,
		});
		const page = new Mesh(new PlaneGeometry(WIDTH - 0.04, DEPTH - 0.04), pageMat);
		page.rotation.x = -Math.PI / 2;
		// Page extends to the right from pivot
		page.position.set((WIDTH - 0.04) / 2, 0, 0);
		pagePivot.add(page);

		pageFlips.push(pagePivot);
	}

	// ─── Position on desk ────────────────────────────────────────
	dictionary.position.set(-0.5, DESK_SURFACE_Y, -0.4);
	dictionary.rotation.y = 0.2;

	return {
		root: dictionary,
		parts: { coverPivot, pageFlips },
	};
}
