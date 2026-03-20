import {
	BoxGeometry,
	CanvasTexture,
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
	/** Progressive joints from the spine shoulder to the page edge. */
	curveJoints: Group[];
}

export interface DictionaryObject {
	root: Group;
	parts: {
		frontCoverPivot: Group;
		pagePacketRoot: Group;
		leftPageBlockPivot: Group;
		leftPageBlockGroup: Group;
		leftPageBlockCurveJoints: Group[];
		/** Segmented page leaves that can curl progressively from spine to edge. */
		pageLeaves: PageLeaf[];
		basePageBlock: Mesh;
		staticEdgeDetailGroup: Group;
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
const LEAF_COUNT = 8;
const LEAF_THICK = 0.005;
const LEAF_STEP = 0.004;
const PACKET_THICK = LEAF_THICK + (LEAF_COUNT - 1) * LEAF_STEP;
const LEAF_SEGMENT_COUNT = 40;
const LEAF_SEGMENT_OVERLAP = 0.006;
const LEAF_SPINE_SHOULDER_X = 0.01;
const LEAF_SPINE_SHOULDER_Y = 0.012;
const LEFT_BLOCK_ROOT_W = PAGE_W * 0.1;
const LEFT_BLOCK_SPINE_OVERHANG = 0.003;
const LEFT_BLOCK_OUTER_W = PAGE_W - LEFT_BLOCK_ROOT_W;
const LEFT_BLOCK_CURVE_SEGMENT_COUNT = 8;
const LEFT_BLOCK_CURVE_SEGMENT_OVERLAP = 0.02;
const LEFT_BLOCK_COVER_INSET = 0.014;
const LEFT_BLOCK_COVER_GAP = 0.006;

const TAB_COUNT = 8;

function createSegmentWidths(
	totalWidth: number,
	segmentCount: number,
	startWeight: number,
	endWeight: number,
): number[] {
	const weights: number[] = [];
	let totalWeight = 0;

	for (let i = 0; i < segmentCount; i++) {
		const t = segmentCount <= 1 ? 0 : i / (segmentCount - 1);
		const weight = startWeight + t * (endWeight - startWeight);
		weights.push(weight);
		totalWeight += weight;
	}

	return weights.map((weight) => (weight / totalWeight) * totalWidth);
}

export const LEAF_SEGMENT_WIDTHS = createSegmentWidths(PAGE_W, LEAF_SEGMENT_COUNT, 0.75, 1.2);
const LEFT_BLOCK_CURVE_SEGMENT_WIDTHS = createSegmentWidths(
	LEFT_BLOCK_OUTER_W,
	LEFT_BLOCK_CURVE_SEGMENT_COUNT,
	0.5,
	1.35,
);

/** Create a canvas texture that looks like a dictionary page —
 *  bold headword blocks and thinner definition lines. */
function createPageTexture(seed: number): MeshStandardMaterial {
	const canvas = document.createElement("canvas");
	const w = 512;
	const h = 512;
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext("2d");
	if (!ctx) return new MeshStandardMaterial({ color: new Color("#f0e8d8"), roughness: 1.0 });

	// Page background
	ctx.fillStyle = "#ede5d5";
	ctx.fillRect(0, 0, w, h);

	const margin = 40;
	const contentW = w - margin * 2;
	let y = margin;
	let entry = 0;

	// Pseudo-random helper
	const rand = (s: number) => Math.sin(s * 127.1 + seed * 311.7) * 0.5 + 0.5;

	while (y < h - margin - 20) {
		// Headword block — thick, bold, partial width
		const headW = contentW * (0.2 + rand(entry * 3.1) * 0.25);
		ctx.fillStyle = "#5a5045";
		ctx.fillRect(margin, y, headW, 12);
		y += 20;

		// Definition lines — thinner, varying widths
		const defLines = 2 + Math.floor(rand(entry * 7.3) * 4);
		for (let dl = 0; dl < defLines && y < h - margin; dl++) {
			const lineW = contentW * (0.5 + rand(entry * 11 + dl * 3.7) * 0.45);
			const lineX = margin + (dl === 0 ? 16 : 0); // first line indented
			ctx.fillStyle = "#8a8278";
			ctx.fillRect(lineX, y, lineW, 4);
			y += 12;
		}

		y += 10; // gap between entries
		entry++;
	}

	const texture = new CanvasTexture(canvas);
	return new MeshStandardMaterial({
		map: texture,
		roughness: 1.0,
	});
}

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
	backCover.receiveShadow = true;
	dictionary.add(backCover);

	// ─── Base page block (fixed, bulk of pages) ──────────────────
	const basePages = new Mesh(
		new BoxGeometry(PAGE_W, BASE_PAGE_THICK, PAGE_D),
		dictionaryPagesMaterial,
	);
	basePages.position.set(HINGE_X + PAGE_W / 2, COVER_THICK + BASE_PAGE_THICK / 2, 0);
	dictionary.add(basePages);

	const leftPageBlockPivot = new Group();
	leftPageBlockPivot.visible = false;

	const leftPageBlockGroup = new Group();
	leftPageBlockGroup.position.y = 0;
	leftPageBlockPivot.add(leftPageBlockGroup);

	const leftBlockRoot = new Mesh(
		new BoxGeometry(LEFT_BLOCK_ROOT_W + LEFT_BLOCK_SPINE_OVERHANG, BASE_PAGE_THICK, PAGE_D),
		dictionaryPagesMaterial,
	);
	leftBlockRoot.position.set(
		(LEFT_BLOCK_ROOT_W - LEFT_BLOCK_SPINE_OVERHANG) / 2,
		-BASE_PAGE_THICK / 2,
		0,
	);
	leftBlockRoot.castShadow = true;
	leftBlockRoot.receiveShadow = true;
	leftPageBlockGroup.add(leftBlockRoot);

	const leftPageBlockCurveJoints: Group[] = [];
	let leftBlockParent = leftPageBlockGroup;

	for (
		let segmentIndex = 0;
		segmentIndex < LEFT_BLOCK_CURVE_SEGMENT_WIDTHS.length;
		segmentIndex++
	) {
		const segmentWidth = LEFT_BLOCK_CURVE_SEGMENT_WIDTHS[segmentIndex];
		const joint = new Group();
		joint.position.set(segmentIndex === 0 ? LEFT_BLOCK_ROOT_W : 0, 0, 0);
		leftBlockParent.add(joint);
		leftPageBlockCurveJoints.push(joint);

		const segment = new Mesh(
			new BoxGeometry(segmentWidth + LEFT_BLOCK_CURVE_SEGMENT_OVERLAP, BASE_PAGE_THICK, PAGE_D),
			dictionaryPagesMaterial,
		);
		segment.position.set(segmentWidth / 2, -BASE_PAGE_THICK / 2, 0);
		segment.castShadow = true;
		segment.receiveShadow = true;
		joint.add(segment);

		leftBlockParent = joint;
		if (segmentIndex < LEFT_BLOCK_CURVE_SEGMENT_WIDTHS.length - 1) {
			const segmentEnd = new Group();
			segmentEnd.position.set(segmentWidth, 0, 0);
			joint.add(segmentEnd);
			leftBlockParent = segmentEnd;
		}
	}

	// ─── Page packet root (kept for interface compat) ────────────
	const pagePacketRoot = new Group();
	pagePacketRoot.position.set(0, 0, 0);
	dictionary.add(pagePacketRoot);

	const staticEdgeDetailGroup = new Group();
	staticEdgeDetailGroup.visible = false;
	dictionary.add(staticEdgeDetailGroup);

	// ─── Loose riffle leaves — only the thumb packet moves freely ──
	// The main page volume is handled by left/right page blocks.
	// These leaves represent the small packet being thumbed through.
	const pageLeaves: PageLeaf[] = [];
	for (let i = 0; i < LEAF_COUNT; i++) {
		const t = i / (LEAF_COUNT - 1);
		const leafColor = new Color().lerpColors(new Color("#f0e8d8"), new Color("#e4dcc8"), t);
		const leafMat = new MeshStandardMaterial({ color: leafColor, roughness: 1.0 });

		// Roots spread across the top 60% of the page block so each
		// page visibly originates from a different spine height.
		const pageY = COVER_THICK + BASE_PAGE_THICK * (0.95 - t * 0.55);
		const pageX = HINGE_X + 0.002 + t * LEAF_SPINE_SHOULDER_X;
		const flipPivot = new Group();
		flipPivot.position.set(pageX, pageY + t * LEAF_SPINE_SHOULDER_Y, 0);
		flipPivot.visible = false; // hidden when closed — base block shows the stack
		dictionary.add(flipPivot);

		const curveJoints: Group[] = [];
		let parent: Group = flipPivot;

		for (let segmentIndex = 0; segmentIndex < LEAF_SEGMENT_WIDTHS.length; segmentIndex++) {
			const segmentWidth = LEAF_SEGMENT_WIDTHS[segmentIndex];
			const segment = new Mesh(
				new BoxGeometry(segmentWidth + LEAF_SEGMENT_OVERLAP, LEAF_THICK, PAGE_D),
				leafMat,
			);
			const segmentOffsetY = segmentIndex === 0 ? LEAF_THICK / 2 : 0;
			segment.position.set(segmentWidth / 2, segmentOffsetY, 0);
			segment.castShadow = true;
			segment.receiveShadow = true;
			parent.add(segment);

			if (segmentIndex === LEAF_SEGMENT_WIDTHS.length - 1) continue;

			const joint = new Group();
			joint.position.set(segmentWidth, segmentOffsetY, 0);
			parent.add(joint);
			curveJoints.push(joint);
			parent = joint;
		}

		pageLeaves.push({ flipPivot, curveJoints });
	}

	// ─── Front cover — pivots at left-spine hinge ────────────────
	const frontCoverPivot = new Group();
	frontCoverPivot.position.set(HINGE_X, COVER_THICK + BASE_PAGE_THICK + PACKET_THICK + 0.002, 0);
	dictionary.add(frontCoverPivot);

	leftPageBlockPivot.position.set(LEFT_BLOCK_COVER_INSET, -LEFT_BLOCK_COVER_GAP, 0);
	frontCoverPivot.add(leftPageBlockPivot);

	const frontCover = new Mesh(
		new BoxGeometry(COVER_W, COVER_THICK, DEPTH),
		dictionaryLeatherMaterial,
	);
	frontCover.position.set(COVER_W / 2, COVER_THICK / 2, 0);
	frontCover.castShadow = true;
	frontCover.receiveShadow = true;
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
		staticEdgeDetailGroup.add(tab);
	}

	// ─── Page-edge lines on right and front edges ────────────────
	const linesMat = new MeshStandardMaterial({ color: new Color("#d8d0c0"), roughness: 1.0 });
	for (let i = 0; i < 10; i++) {
		const t = (i + 1) / 11;
		const y = COVER_THICK + BASE_PAGE_THICK * t;
		const rightEdge = new Mesh(new BoxGeometry(0.001, 0.0008, PAGE_D), linesMat);
		rightEdge.position.set(HINGE_X + PAGE_W + 0.001, y, 0);
		staticEdgeDetailGroup.add(rightEdge);
		const frontEdge = new Mesh(new BoxGeometry(PAGE_W, 0.0008, 0.001), linesMat);
		frontEdge.position.set(HINGE_X + PAGE_W / 2, y, DEPTH / 2 - 0.012);
		staticEdgeDetailGroup.add(frontEdge);
	}

	// ─── Position on desk ────────────────────────────────────────
	dictionary.position.set(-0.8, DESK_SURFACE_Y, -0.5);
	dictionary.rotation.y = 0.15;

	return {
		root: dictionary,
		parts: {
			frontCoverPivot,
			pagePacketRoot,
			leftPageBlockPivot,
			leftPageBlockGroup,
			leftPageBlockCurveJoints,
			pageLeaves,
			basePageBlock: basePages,
			staticEdgeDetailGroup,
		},
	};
}
