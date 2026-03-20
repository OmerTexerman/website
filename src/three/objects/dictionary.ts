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
		/** Outer pivot at the spine's bottom edge — tilts the whole book up. */
		tiltPivot: Group;
		/** Front cover pivots at spine, swings toward viewer (rotation.x). */
		frontCoverPivot: Group;
		/** Back cover pivots at spine, swings away from viewer (rotation.x). */
		backCoverPivot: Group;
		/** Right page block pivots with front cover. */
		rightPagesPivot: Group;
		/** Left page block pivots with back cover. */
		leftPagesPivot: Group;
		/** Individual pages for the riffle animation. */
		rifflePages: Group[];
	};
}

// Lying flat dimensions
const WIDTH = 0.6; // X — left to right (spine on left)
const THICKNESS = 0.16; // Y — height when flat
const DEPTH = 0.75; // Z — front to back
const COVER_THICK = 0.014;
const PAGES_H = THICKNESS - COVER_THICK * 2;
const SPINE_W = 0.04; // how wide the spine block is (X)
const SPINE_OVERHANG = 0.01; // how much spine protrudes past covers
const BODY_W = WIDTH - SPINE_W + 0.005; // cover/page width (overlaps spine slightly)
const BODY_CENTER_X = SPINE_W / 2 + 0.005; // offset from spine to center covers
const RIFFLE_PAGE_COUNT = 14;
const TAB_COUNT = 8;

/** Dictionary → links to /word-of-the-day
 *
 *  Lies flat on the desk. Spine binding on the left side.
 *  Animation: tilts up on spine edge, covers fall open, pages riffle.
 */
export function createDictionary(): DictionaryObject {
	const dictionary = new Group();
	applySectionInteraction(dictionary, "wordOfTheDay");

	// ─── Tilt pivot at the spine's bottom-left edge ──────────────
	// When rotation.z increases, the book tilts up on its spine edge.
	const tiltPivot = new Group();
	tiltPivot.position.set(-WIDTH / 2, 0, 0);
	dictionary.add(tiltPivot);

	// Everything is built inside tiltPivot, offset so spine edge is at origin
	const body = new Group();
	body.position.set(WIDTH / 2, 0, 0);
	tiltPivot.add(body);

	// ─── Spine block (the binding) ───────────────────────────────
	const spineBlock = new Mesh(
		new BoxGeometry(SPINE_W + SPINE_OVERHANG, THICKNESS, DEPTH),
		dictionarySpineMaterial,
	);
	spineBlock.position.set(-WIDTH / 2 + SPINE_W / 2 - SPINE_OVERHANG / 2, THICKNESS / 2, 0);
	spineBlock.castShadow = true;
	body.add(spineBlock);

	// Gold label on spine face (the -X face, visible from the left)
	const spineLabelGeo = new PlaneGeometry(DEPTH * 0.5, THICKNESS * 0.4);
	const spineLabelMat = new MeshStandardMaterial({
		color: new Color(DICTIONARY_GOLD),
		roughness: 0.3,
		metalness: 0.55,
		side: DoubleSide,
	});
	const spineLabel = new Mesh(spineLabelGeo, spineLabelMat);
	spineLabel.rotation.y = Math.PI / 2;
	spineLabel.position.set(-WIDTH / 2 - SPINE_OVERHANG + 0.001, THICKNESS / 2, 0);
	body.add(spineLabel);

	// Gold bands on spine
	for (const zOff of [-DEPTH * 0.32, 0, DEPTH * 0.32]) {
		const bandGeo = new PlaneGeometry(SPINE_W + SPINE_OVERHANG + 0.005, 0.008);
		const band = new Mesh(bandGeo, dictionaryGoldMaterial);
		band.rotation.y = Math.PI / 2;
		band.position.set(-WIDTH / 2 - SPINE_OVERHANG + 0.0005, THICKNESS / 2, zOff);
		body.add(band);
	}

	// ─── Bottom cover ────────────────────────────────────────────
	const bottomCover = new Mesh(
		new BoxGeometry(BODY_W, COVER_THICK, DEPTH),
		dictionaryLeatherMaterial,
	);
	bottomCover.position.set(BODY_CENTER_X, COVER_THICK / 2, 0);
	bottomCover.castShadow = true;
	body.add(bottomCover);

	// ─── Back cover pivot (swings away, -rotation.x) ─────────────
	const backCoverPivot = new Group();
	backCoverPivot.position.set(BODY_CENTER_X, COVER_THICK, -DEPTH / 2);
	body.add(backCoverPivot);

	// Left page block (attached to back cover side)
	const leftPagesPivot = new Group();
	backCoverPivot.add(leftPagesPivot);

	const leftPages = new Mesh(
		new BoxGeometry(BODY_W - 0.02, PAGES_H / 2 - 0.005, DEPTH - 0.02),
		dictionaryPagesMaterial,
	);
	leftPages.position.set(0, PAGES_H / 4, DEPTH / 2);
	leftPagesPivot.add(leftPages);

	// ─── Front cover pivot (swings toward viewer, +rotation.x) ───
	const frontCoverPivot = new Group();
	frontCoverPivot.position.set(BODY_CENTER_X, COVER_THICK + PAGES_H, -DEPTH / 2);
	body.add(frontCoverPivot);

	const frontCover = new Mesh(
		new BoxGeometry(BODY_W, COVER_THICK, DEPTH),
		dictionaryLeatherMaterial,
	);
	frontCover.position.set(0, COVER_THICK / 2, DEPTH / 2);
	frontCover.castShadow = true;
	frontCoverPivot.add(frontCover);

	// Gold border on front cover
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
	frontCoverPivot.add(border);

	// Gold title bar on front cover
	const titleBar = new Mesh(new PlaneGeometry(BODY_W * 0.5, 0.04), dictionaryGoldMaterial);
	titleBar.rotation.x = -Math.PI / 2;
	titleBar.position.set(0, COVER_THICK + 0.002, DEPTH * 0.55);
	frontCoverPivot.add(titleBar);

	// Subtitle
	const subtitle = new Mesh(new PlaneGeometry(BODY_W * 0.3, 0.015), dictionaryGoldMaterial);
	subtitle.rotation.x = -Math.PI / 2;
	subtitle.position.set(0, COVER_THICK + 0.002, DEPTH * 0.42);
	frontCoverPivot.add(subtitle);

	// Right page block (attached to front cover side)
	const rightPagesPivot = new Group();
	frontCoverPivot.add(rightPagesPivot);

	const rightPages = new Mesh(
		new BoxGeometry(BODY_W - 0.02, PAGES_H / 2 - 0.005, DEPTH - 0.02),
		dictionaryPagesMaterial,
	);
	rightPages.position.set(0, -(PAGES_H / 4), DEPTH / 2);
	rightPagesPivot.add(rightPages);

	// ─── Thumb index tabs along right edge (+X) ──────────────────
	const tabDepth = (DEPTH - 0.04) / TAB_COUNT;
	for (let i = 0; i < TAB_COUNT; i++) {
		const z = -DEPTH / 2 + 0.02 + tabDepth * i + tabDepth / 2;
		const y = COVER_THICK + PAGES_H / 2;
		const tabGeo = new CylinderGeometry(0.02, 0.02, 0.005, 8);
		const tabMat = new MeshStandardMaterial({ color: new Color("#c4b898"), roughness: 0.9 });
		const tab = new Mesh(tabGeo, tabMat);
		tab.rotation.z = Math.PI / 2;
		tab.position.set(BODY_CENTER_X + BODY_W / 2 - 0.003, y, z);
		body.add(tab);
	}

	// ─── Page-edge lines ─────────────────────────────────────────
	const edgeMat = new MeshStandardMaterial({ color: new Color("#d8d0c0"), roughness: 1.0 });
	for (let i = 0; i < 10; i++) {
		const t = (i + 1) / 11;
		const y = COVER_THICK + PAGES_H * t;
		// Right edge
		const rightEdge = new Mesh(new BoxGeometry(0.001, 0.0008, DEPTH - 0.04), edgeMat);
		rightEdge.position.set(BODY_CENTER_X + BODY_W / 2 - 0.012, y, 0);
		body.add(rightEdge);
		// Front edge
		const frontEdge = new Mesh(new BoxGeometry(BODY_W - 0.04, 0.0008, 0.001), edgeMat);
		frontEdge.position.set(BODY_CENTER_X, y, DEPTH / 2 - 0.012);
		body.add(frontEdge);
	}

	// ─── Riffle pages (pivot at spine, rotate around Z for tilt,
	//     then around X once book is open) ─────────────────────────
	const rifflePages: Group[] = [];
	for (let i = 0; i < RIFFLE_PAGE_COUNT; i++) {
		const pagePivot = new Group();
		// Pivot at spine, middle height — pages extend rightward
		pagePivot.position.set(-WIDTH / 2 + SPINE_W, COVER_THICK + PAGES_H * 0.5, -DEPTH / 2);
		body.add(pagePivot);

		const pageMat = new MeshStandardMaterial({
			color: new Color("#f0e8d8"),
			roughness: 1.0,
			side: DoubleSide,
			transparent: true,
			opacity: 0.8,
		});
		const page = new Mesh(new PlaneGeometry(BODY_W - 0.04, DEPTH - 0.04), pageMat);
		// Lay flat — page extends right from spine, forward from back
		page.rotation.x = -Math.PI / 2;
		page.position.set((BODY_W - 0.04) / 2, 0, (DEPTH - 0.04) / 2);
		pagePivot.add(page);

		rifflePages.push(pagePivot);
	}

	// ─── Position on desk ────────────────────────────────────────
	dictionary.position.set(-1.0, DESK_SURFACE_Y, -0.7);
	dictionary.rotation.y = 0.25;

	return {
		root: dictionary,
		parts: {
			tiltPivot,
			frontCoverPivot,
			backCoverPivot,
			rightPagesPivot,
			leftPagesPivot,
			rifflePages,
		},
	};
}
