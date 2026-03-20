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
		/** Cover pivots at the spine (back edge, z = -DEPTH/2). */
		coverPivot: Group;
		/** Individual page pivots at the spine for flip animation. */
		pageFlips: Group[];
	};
}

// Lying flat dimensions
const WIDTH = 0.6; // X — left to right
const THICKNESS = 0.16; // Y — how thick (tall when flat)
const DEPTH = 0.75; // Z — front to back
const COVER_THICK = 0.015;
const PAGES_H = THICKNESS - COVER_THICK * 2;
const PAGE_FLIP_COUNT = 8;
const TAB_LETTERS = ["A", "D", "G", "K", "N", "R", "T", "W"];

/** Dictionary → links to /word-of-the-day
 *
 *  Lies flat on the desk — thick leather-bound dictionary with thumb
 *  index tabs along the fore-edge (the detail that says "dictionary").
 *  Cover opens at the spine, pages flip rapidly like looking up a word.
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

	// ─── Thumb index tabs along the fore-edge (+Z side) ──────────
	// These half-circle notches with letters are the iconic dictionary detail
	const tabHeight = PAGES_H / TAB_LETTERS.length;
	const tabRadius = 0.025;
	for (let i = 0; i < TAB_LETTERS.length; i++) {
		const y = COVER_THICK + tabHeight * i + tabHeight / 2;

		// Small protruding tab
		const tabGeo = new CylinderGeometry(tabRadius, tabRadius, 0.006, 8);
		const tabMat = new MeshStandardMaterial({
			color: new Color("#c4b898"),
			roughness: 0.9,
		});
		const tab = new Mesh(tabGeo, tabMat);
		tab.rotation.x = Math.PI / 2;
		tab.position.set(0, y, DEPTH / 2 - 0.005);
		dictionary.add(tab);

		// Letter label on each tab
		const labelGeo = new PlaneGeometry(0.02, 0.015);
		const labelMat = new MeshStandardMaterial({
			color: new Color("#3a3020"),
			roughness: 1.0,
			side: DoubleSide,
		});
		const label = new Mesh(labelGeo, labelMat);
		label.position.set(0, y, DEPTH / 2 + 0.001);
		dictionary.add(label);
	}

	// ─── Page-edge lines on the fore-edge and right edge ─────────
	const edgeMat = new MeshStandardMaterial({ color: new Color("#d8d0c0"), roughness: 1.0 });
	for (let i = 0; i < 10; i++) {
		const t = (i + 1) / 11;
		const y = COVER_THICK + PAGES_H * t;
		// Fore-edge (front, +Z)
		const foreEdge = new Mesh(new BoxGeometry(WIDTH - 0.04, 0.0008, 0.001), edgeMat);
		foreEdge.position.set(0, y, DEPTH / 2 - 0.012);
		dictionary.add(foreEdge);
		// Right edge (+X)
		const rightEdge = new Mesh(new BoxGeometry(0.001, 0.0008, DEPTH - 0.04), edgeMat);
		rightEdge.position.set(WIDTH / 2 - 0.012, y, 0);
		dictionary.add(rightEdge);
	}

	// ─── Top cover — pivots at spine (back edge) ─────────────────
	const coverPivot = new Group();
	coverPivot.position.set(0, COVER_THICK + PAGES_H, -DEPTH / 2);
	dictionary.add(coverPivot);

	const topCover = new Mesh(new BoxGeometry(WIDTH, COVER_THICK, DEPTH), dictionaryLeatherMaterial);
	topCover.position.set(0, COVER_THICK / 2, DEPTH / 2);
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
	border.position.set(0, COVER_THICK + 0.001, DEPTH / 2);
	coverPivot.add(border);

	// Gold title bar
	const titleBar = new Mesh(new PlaneGeometry(WIDTH * 0.5, 0.04), dictionaryGoldMaterial);
	titleBar.rotation.x = -Math.PI / 2;
	titleBar.position.set(0, COVER_THICK + 0.002, DEPTH * 0.55);
	coverPivot.add(titleBar);

	// Subtitle line
	const subtitle = new Mesh(new PlaneGeometry(WIDTH * 0.3, 0.015), dictionaryGoldMaterial);
	subtitle.rotation.x = -Math.PI / 2;
	subtitle.position.set(0, COVER_THICK + 0.002, DEPTH * 0.42);
	coverPivot.add(subtitle);

	// Gold corner ornaments (small squares at each corner of the cover)
	const cornerSize = 0.03;
	const cornerGeo = new PlaneGeometry(cornerSize, cornerSize);
	for (const [cx, cz] of [
		[-WIDTH / 2 + 0.04, 0.04],
		[WIDTH / 2 - 0.04, 0.04],
		[-WIDTH / 2 + 0.04, DEPTH - 0.04],
		[WIDTH / 2 - 0.04, DEPTH - 0.04],
	]) {
		const corner = new Mesh(cornerGeo, dictionaryGoldMaterial);
		corner.rotation.x = -Math.PI / 2;
		corner.rotation.z = Math.PI / 4;
		corner.position.set(cx, COVER_THICK + 0.0015, cz);
		coverPivot.add(corner);
	}

	// ─── Page flip groups (pivot at spine for flip animation) ─────
	const pageFlips: Group[] = [];
	for (let i = 0; i < PAGE_FLIP_COUNT; i++) {
		const pagePivot = new Group();
		// Pivot at the spine (back edge)
		pagePivot.position.set(0, COVER_THICK + PAGES_H * 0.5, -DEPTH / 2 + 0.01);
		dictionary.add(pagePivot);

		const pageMat = new MeshStandardMaterial({
			color: new Color("#f0e8d8"),
			roughness: 1.0,
			side: DoubleSide,
			transparent: true,
			opacity: 0.85,
		});
		const page = new Mesh(new PlaneGeometry(WIDTH - 0.04, DEPTH - 0.04), pageMat);
		// Page extends forward from spine (+Z)
		page.rotation.x = -Math.PI / 2;
		page.position.set(0, 0, (DEPTH - 0.04) / 2);
		pagePivot.add(page);

		pageFlips.push(pagePivot);
	}

	// ─── Rounded spine along back edge ───────────────────────────
	const spineRadius = COVER_THICK * 1.2;
	const spineGeo = new CylinderGeometry(
		spineRadius,
		spineRadius,
		WIDTH - 0.01,
		8,
		1,
		false,
		0,
		Math.PI,
	);
	const spine = new Mesh(spineGeo, dictionaryLeatherMaterial);
	spine.rotation.z = Math.PI / 2;
	spine.rotation.y = Math.PI / 2;
	spine.position.set(0, COVER_THICK + PAGES_H / 2, -DEPTH / 2 + 0.003);
	dictionary.add(spine);

	// ─── Position on desk ────────────────────────────────────────
	// Between notebook and laptop, behind the mug
	dictionary.position.set(-0.5, DESK_SURFACE_Y, -0.4);
	dictionary.rotation.y = 0.2;

	return {
		root: dictionary,
		parts: { coverPivot, pageFlips },
	};
}
