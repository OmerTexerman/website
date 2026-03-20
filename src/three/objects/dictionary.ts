import {
	BoxGeometry,
	Color,
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

export interface PageLeaf {
	/** Outer pivot at the spine hinge — controls the main flip rotation. */
	flipPivot: Group;
	/** Joint between segment 1 (root) and segment 2 (mid). */
	joint1: Group;
	/** Joint between segment 2 (mid) and segment 3 (tip). */
	joint2: Group;
}

export interface DictionaryObject {
	root: Group;
	parts: {
		frontCoverPivot: Group;
		pagePacketRoot: Group;
		/** 2-piece page leaves: each has a flip pivot and a bend joint. */
		pageLeaves: PageLeaf[];
		basePageBlock: Mesh;
	};
}

// Lying flat — spine on the left (−X)
const WIDTH = 0.6;

const DEPTH = 0.75;
const COVER_THICK = 0.014;
const SPINE_W = 0.04;
const SPINE_OVERHANG = 0.01;

// Hinge line: left edge of covers, where spine meets body
const HINGE_X = -WIDTH / 2 + SPINE_W;
const COVER_W = WIDTH - SPINE_W + 0.005;
const PAGE_W = WIDTH - SPINE_W - 0.018;
const PAGE_D = DEPTH - 0.024;

// Page packet sitting on top of the base page block
const BASE_PAGE_THICK = 0.1;
// 3-segment page: root + mid + tip, each with a bend joint
const SEG1_W = PAGE_W * 0.2; // root (at spine)
const SEG2_W = PAGE_W * 0.35; // mid
const SEG3_W = PAGE_W * 0.45; // tip (longest, most visible)
const LEAF_COUNT = 20;
const LEAF_THICK = 0.003;
const LEAF_STEP = 0.0008;
const PACKET_THICK = LEAF_THICK + (LEAF_COUNT - 1) * LEAF_STEP;

const TAB_COUNT = 8;

/** Dictionary → links to /word-of-the-day
 *
 *  Lies flat. Spine binding on the left. Thumb tabs on the right.
 *  Cover cracks open ~30° sideways (rotation.z at left-spine hinge).
 *  Pages riffle within the narrow gap — restrained, tactile.
 */
export function createDictionary(): DictionaryObject {
	const dictionary = new Group();
	applySectionInteraction(dictionary, "wordOfTheDay");

	const totalThickness = COVER_THICK * 2 + BASE_PAGE_THICK + PACKET_THICK + 0.002;

	// ─── Spine block (binding along left edge) ───────────────────
	const spineBlock = new Mesh(
		new BoxGeometry(SPINE_W + SPINE_OVERHANG, totalThickness, DEPTH),
		dictionarySpineMaterial,
	);
	spineBlock.position.set(
		-WIDTH / 2 + (SPINE_W + SPINE_OVERHANG) / 2 - SPINE_OVERHANG,
		totalThickness / 2,
		0,
	);
	spineBlock.castShadow = true;
	dictionary.add(spineBlock);

	// Gold label on spine face (−X face)
	const spineLabelMat = new MeshStandardMaterial({
		color: new Color(DICTIONARY_GOLD),
		roughness: 0.3,
		metalness: 0.55,
		side: DoubleSide,
	});
	const spineLabel = new Mesh(
		new PlaneGeometry(DEPTH * 0.45, totalThickness * 0.35),
		spineLabelMat,
	);
	spineLabel.rotation.y = Math.PI / 2;
	spineLabel.position.set(-WIDTH / 2 - SPINE_OVERHANG + 0.001, totalThickness / 2, 0);
	dictionary.add(spineLabel);

	// ─── Back cover (bottom, fixed) ──────────────────────────────
	const backCover = new Mesh(
		new BoxGeometry(COVER_W, COVER_THICK, DEPTH),
		dictionaryLeatherMaterial,
	);
	backCover.position.set(HINGE_X + COVER_W / 2, COVER_THICK / 2, 0);
	backCover.castShadow = true;
	dictionary.add(backCover);

	// ─── Base page block (fixed, bulk of pages) ──────────────────
	const basePages = new Mesh(
		new BoxGeometry(PAGE_W, BASE_PAGE_THICK, PAGE_D),
		dictionaryPagesMaterial,
	);
	basePages.position.set(HINGE_X + PAGE_W / 2, COVER_THICK + BASE_PAGE_THICK / 2, 0);
	dictionary.add(basePages);

	// ─── Page packet root (kept for interface compat) ────────────
	const pagePacketRoot = new Group();
	pagePacketRoot.position.set(0, 0, 0);
	dictionary.add(pagePacketRoot);

	// ─── Page leaves — each pivots at its actual Y in the stack ──
	// Page 0 is at the TOP of the page block (flips first).
	// Page N-1 is near the bottom. Each originates from a different
	// height so the fan looks like pages peeling from the stack.
	const pageLeaves: PageLeaf[] = [];
	for (let i = 0; i < LEAF_COUNT; i++) {
		const t = i / (LEAF_COUNT - 1);
		const leafColor = new Color().lerpColors(new Color("#f0e8d8"), new Color("#e4dcc8"), t);
		const leafMat = new MeshStandardMaterial({ color: leafColor, roughness: 1.0 });

		// Each page's Y: spread across the top 60% of the page block
		// (bottom 40% stays as the solid base that doesn't move)
		const pageY = COVER_THICK + BASE_PAGE_THICK * (1 - t * 0.6);
		const flipPivot = new Group();
		flipPivot.position.set(HINGE_X, pageY, 0);
		flipPivot.visible = false;
		dictionary.add(flipPivot);

		// Segment 1: root (at spine)
		const seg1 = new Mesh(new BoxGeometry(SEG1_W, LEAF_THICK, PAGE_D), leafMat);
		seg1.position.set(SEG1_W / 2, LEAF_THICK / 2, 0);
		seg1.castShadow = true;
		flipPivot.add(seg1);

		// Joint 1: between root and mid
		const joint1 = new Group();
		joint1.position.set(SEG1_W, LEAF_THICK / 2, 0);
		flipPivot.add(joint1);

		// Segment 2: mid
		const seg2 = new Mesh(new BoxGeometry(SEG2_W, LEAF_THICK, PAGE_D), leafMat);
		seg2.position.set(SEG2_W / 2, 0, 0);
		seg2.castShadow = true;
		joint1.add(seg2);

		// Joint 2: between mid and tip
		const joint2 = new Group();
		joint2.position.set(SEG2_W, 0, 0);
		joint1.add(joint2);

		// Segment 3: tip
		const seg3 = new Mesh(new BoxGeometry(SEG3_W, LEAF_THICK, PAGE_D), leafMat);
		seg3.position.set(SEG3_W / 2, 0, 0);
		seg3.castShadow = true;
		seg3.receiveShadow = true;
		joint2.add(seg3);

		pageLeaves.push({ flipPivot, joint1, joint2 });
	}

	// ─── Front cover — pivots at left-spine hinge ────────────────
	const frontCoverPivot = new Group();
	frontCoverPivot.position.set(HINGE_X, COVER_THICK + BASE_PAGE_THICK + PACKET_THICK + 0.002, 0);
	dictionary.add(frontCoverPivot);

	const frontCover = new Mesh(
		new BoxGeometry(COVER_W, COVER_THICK, DEPTH),
		dictionaryLeatherMaterial,
	);
	frontCover.position.set(COVER_W / 2, COVER_THICK / 2, 0);
	frontCover.castShadow = true;
	frontCoverPivot.add(frontCover);

	// Gold border on cover
	const borderMat = new MeshStandardMaterial({
		color: new Color(DICTIONARY_GOLD),
		roughness: 0.3,
		metalness: 0.55,
		transparent: true,
		opacity: 0.45,
		side: DoubleSide,
	});
	const border = new Mesh(new PlaneGeometry(COVER_W - 0.06, DEPTH - 0.06), borderMat);
	border.rotation.x = -Math.PI / 2;
	border.position.set(COVER_W / 2, COVER_THICK + 0.001, 0);
	frontCoverPivot.add(border);

	// Gold title bar
	const titleBar = new Mesh(new PlaneGeometry(COVER_W * 0.5, 0.04), dictionaryGoldMaterial);
	titleBar.rotation.x = -Math.PI / 2;
	titleBar.position.set(COVER_W / 2, COVER_THICK + 0.002, -DEPTH * 0.08);
	frontCoverPivot.add(titleBar);

	// Subtitle
	const subtitle = new Mesh(new PlaneGeometry(COVER_W * 0.3, 0.015), dictionaryGoldMaterial);
	subtitle.rotation.x = -Math.PI / 2;
	subtitle.position.set(COVER_W / 2, COVER_THICK + 0.002, DEPTH * 0.06);
	frontCoverPivot.add(subtitle);

	// ─── Thumb index tabs along right edge (+X) ──────────────────
	const tabDepth = (DEPTH - 0.04) / TAB_COUNT;
	const edgeMat = new MeshStandardMaterial({ color: new Color("#c4b898"), roughness: 0.9 });
	for (let i = 0; i < TAB_COUNT; i++) {
		const z = -DEPTH / 2 + 0.02 + tabDepth * i + tabDepth / 2;
		const tabGeo = new BoxGeometry(0.015, BASE_PAGE_THICK * 0.8, tabDepth * 0.5);
		const tab = new Mesh(tabGeo, edgeMat);
		tab.position.set(HINGE_X + PAGE_W + 0.008, COVER_THICK + BASE_PAGE_THICK / 2, z);
		dictionary.add(tab);
	}

	// ─── Page-edge lines on right and front edges ────────────────
	const linesMat = new MeshStandardMaterial({ color: new Color("#d8d0c0"), roughness: 1.0 });
	for (let i = 0; i < 10; i++) {
		const t = (i + 1) / 11;
		const y = COVER_THICK + BASE_PAGE_THICK * t;
		const rightEdge = new Mesh(new BoxGeometry(0.001, 0.0008, PAGE_D), linesMat);
		rightEdge.position.set(HINGE_X + PAGE_W + 0.001, y, 0);
		dictionary.add(rightEdge);
		const frontEdge = new Mesh(new BoxGeometry(PAGE_W, 0.0008, 0.001), linesMat);
		frontEdge.position.set(HINGE_X + PAGE_W / 2, y, DEPTH / 2 - 0.012);
		dictionary.add(frontEdge);
	}

	// ─── Position on desk ────────────────────────────────────────
	dictionary.position.set(-0.8, DESK_SURFACE_Y, -0.5);
	dictionary.rotation.y = 0.15;

	return {
		root: dictionary,
		parts: { frontCoverPivot, pagePacketRoot, pageLeaves, basePageBlock: basePages },
	};
}
