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
	dictionarySpineMaterial,
} from "../materials";
import { DESK_SURFACE_Y } from "../math-utils";

export interface DictionaryObject {
	root: Group;
	parts: {
		/** Front cover pivots at left-side spine. rotation.x lifts it open. */
		coverPivot: Group;
		/** Thin page leaves that fan within the cover opening. */
		pageLeaves: Group[];
	};
}

// Lying flat — spine on the left (−X)
const WIDTH = 0.6;
const THICKNESS = 0.16;
const DEPTH = 0.75;
const COVER_THICK = 0.014;
const PAGES_H = THICKNESS - COVER_THICK * 2;
const SPINE_W = 0.04;
const SPINE_OVERHANG = 0.01;
const BODY_W = WIDTH - SPINE_W + 0.005;
const BODY_CX = SPINE_W / 2 + 0.005; // center-X of covers relative to body
const PAGE_LEAF_COUNT = 12;
const TAB_COUNT = 8;

/** Dictionary → links to /word-of-the-day
 *
 *  Lies flat. Spine binding on the left. Thumb tabs on the right.
 *  Animation: cover cracks open ~30°, pages riffle rapidly inside
 *  the narrow gap — restrained, tactile, dictionary-specific.
 */
export function createDictionary(): DictionaryObject {
	const dictionary = new Group();
	applySectionInteraction(dictionary, "wordOfTheDay");

	// ─── Spine block (binding along left edge) ───────────────────
	const spineBlock = new Mesh(
		new BoxGeometry(SPINE_W + SPINE_OVERHANG, THICKNESS, DEPTH),
		dictionarySpineMaterial,
	);
	spineBlock.position.set(-WIDTH / 2 + SPINE_W / 2 - SPINE_OVERHANG / 2, THICKNESS / 2, 0);
	spineBlock.castShadow = true;
	dictionary.add(spineBlock);

	// Gold label on spine face
	const spineLabelMat = new MeshStandardMaterial({
		color: new Color(DICTIONARY_GOLD),
		roughness: 0.3,
		metalness: 0.55,
		side: DoubleSide,
	});
	const spineLabel = new Mesh(new PlaneGeometry(DEPTH * 0.45, THICKNESS * 0.35), spineLabelMat);
	spineLabel.rotation.y = Math.PI / 2;
	spineLabel.position.set(-WIDTH / 2 - SPINE_OVERHANG + 0.001, THICKNESS / 2, 0);
	dictionary.add(spineLabel);

	// ─── Bottom cover (fixed, doesn't move) ──────────────────────
	const bottomCover = new Mesh(
		new BoxGeometry(BODY_W, COVER_THICK, DEPTH),
		dictionaryLeatherMaterial,
	);
	bottomCover.position.set(BODY_CX, COVER_THICK / 2, 0);
	bottomCover.castShadow = true;
	dictionary.add(bottomCover);

	// ─── Lower page block (fixed, bottom half of pages) ──────────
	const lowerPages = new Mesh(
		new BoxGeometry(BODY_W - 0.02, PAGES_H / 2, DEPTH - 0.02),
		dictionaryPagesMaterial,
	);
	lowerPages.position.set(BODY_CX, COVER_THICK + PAGES_H / 4, 0);
	dictionary.add(lowerPages);

	// ─── Upper page block (fixed, top half — visible when closed) ─
	const upperPages = new Mesh(
		new BoxGeometry(BODY_W - 0.02, PAGES_H / 2, DEPTH - 0.02),
		dictionaryPagesMaterial,
	);
	upperPages.position.set(BODY_CX, COVER_THICK + (PAGES_H * 3) / 4, 0);
	dictionary.add(upperPages);

	// ─── Thumb index tabs along right edge (+X) ──────────────────
	const tabDepth = (DEPTH - 0.04) / TAB_COUNT;
	for (let i = 0; i < TAB_COUNT; i++) {
		const z = -DEPTH / 2 + 0.02 + tabDepth * i + tabDepth / 2;
		const tabGeo = new CylinderGeometry(0.02, 0.02, 0.005, 8);
		const tabMat = new MeshStandardMaterial({ color: new Color("#c4b898"), roughness: 0.9 });
		const tab = new Mesh(tabGeo, tabMat);
		tab.rotation.z = Math.PI / 2;
		tab.position.set(BODY_CX + BODY_W / 2 - 0.003, COVER_THICK + PAGES_H / 2, z);
		dictionary.add(tab);
	}

	// ─── Page-edge lines on right and front edges ────────────────
	const edgeMat = new MeshStandardMaterial({ color: new Color("#d8d0c0"), roughness: 1.0 });
	for (let i = 0; i < 10; i++) {
		const t = (i + 1) / 11;
		const y = COVER_THICK + PAGES_H * t;
		const rightEdge = new Mesh(new BoxGeometry(0.001, 0.0008, DEPTH - 0.04), edgeMat);
		rightEdge.position.set(BODY_CX + BODY_W / 2 - 0.012, y, 0);
		dictionary.add(rightEdge);
		const frontEdge = new Mesh(new BoxGeometry(BODY_W - 0.04, 0.0008, 0.001), edgeMat);
		frontEdge.position.set(BODY_CX, y, DEPTH / 2 - 0.012);
		dictionary.add(frontEdge);
	}

	// ─── Front cover — pivots at the BACK edge (z = −DEPTH/2) ────
	// rotation.x swings the cover upward/open from the back edge,
	// like lifting the front of a book. This is the same axis as the
	// notebook BUT the animation is totally different — only ~30° open
	// with a rapid page-thumb inside.
	const coverPivot = new Group();
	coverPivot.position.set(BODY_CX, COVER_THICK + PAGES_H, -DEPTH / 2);
	dictionary.add(coverPivot);

	const frontCover = new Mesh(
		new BoxGeometry(BODY_W, COVER_THICK, DEPTH),
		dictionaryLeatherMaterial,
	);
	frontCover.position.set(0, COVER_THICK / 2, DEPTH / 2);
	frontCover.castShadow = true;
	coverPivot.add(frontCover);

	// Gold border on cover
	const borderMat = new MeshStandardMaterial({
		color: new Color(DICTIONARY_GOLD),
		roughness: 0.3,
		metalness: 0.55,
		transparent: true,
		opacity: 0.45,
		side: DoubleSide,
	});
	const border = new Mesh(new PlaneGeometry(BODY_W - 0.06, DEPTH - 0.06), borderMat);
	border.rotation.x = -Math.PI / 2;
	border.position.set(0, COVER_THICK + 0.001, DEPTH / 2);
	coverPivot.add(border);

	// Gold title bar
	const titleBar = new Mesh(new PlaneGeometry(BODY_W * 0.5, 0.04), dictionaryGoldMaterial);
	titleBar.rotation.x = -Math.PI / 2;
	titleBar.position.set(0, COVER_THICK + 0.002, DEPTH * 0.55);
	coverPivot.add(titleBar);

	// Subtitle
	const subtitle = new Mesh(new PlaneGeometry(BODY_W * 0.3, 0.015), dictionaryGoldMaterial);
	subtitle.rotation.x = -Math.PI / 2;
	subtitle.position.set(0, COVER_THICK + 0.002, DEPTH * 0.42);
	coverPivot.add(subtitle);

	// ─── Page leaves for riffle animation ─────────────────────────
	// Each page pivots at the back edge (same as cover) so they stay
	// within the cover's opening range. They're thin and stacked
	// vertically so they read as individual pages when fanned.
	const pageLeaves: Group[] = [];
	for (let i = 0; i < PAGE_LEAF_COUNT; i++) {
		const pagePivot = new Group();
		// Same pivot as cover — back edge of the page block
		pagePivot.position.set(BODY_CX, COVER_THICK + PAGES_H * 0.55, -DEPTH / 2);
		dictionary.add(pagePivot);

		const t = i / (PAGE_LEAF_COUNT - 1);
		const pageMat = new MeshStandardMaterial({
			color: new Color().lerpColors(new Color("#f0e8d8"), new Color("#e4dcc8"), t),
			roughness: 1.0,
			side: DoubleSide,
			transparent: true,
			opacity: 0.9,
		});
		const page = new Mesh(new PlaneGeometry(BODY_W - 0.04, DEPTH - 0.04), pageMat);
		page.rotation.x = -Math.PI / 2;
		page.position.set(0, 0, (DEPTH - 0.04) / 2);
		pagePivot.add(page);

		pageLeaves.push(pagePivot);
	}

	// ─── Position on desk ────────────────────────────────────────
	// Further back-left, clear of laptop and photo frame
	dictionary.position.set(-0.8, DESK_SURFACE_Y, -0.5);
	dictionary.rotation.y = 0.15;

	return {
		root: dictionary,
		parts: { coverPivot, pageLeaves },
	};
}
