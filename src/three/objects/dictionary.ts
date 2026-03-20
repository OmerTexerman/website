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

interface PageLeaf {
	flipPivot: Group;
	curveJoints: Group[];
}

export interface DictionaryObject {
	root: Group;
	parts: {
		frontCoverPivot: Group;
		pageLeaves: PageLeaf[];
		basePageBlock: Mesh;
	};
}

// ─── Geometry constants ─────────────────────────────────────────
const WIDTH = 0.6;
const DEPTH = 0.75;
const COVER_THICK = 0.014;
const SPINE_W = 0.04;
const SPINE_OVERHANG = 0.01;
const HINGE_X = -WIDTH / 2 + SPINE_W;
const COVER_W = WIDTH - SPINE_W + 0.005;
const PAGE_W = WIDTH - SPINE_W - 0.018;
const PAGE_D = DEPTH - 0.024;
const BASE_PAGE_THICK = 0.1;
const LEAF_COUNT = 8;
const LEAF_THICK = 0.005;
const LEAF_STEP = 0.004;
const PACKET_THICK = LEAF_THICK + (LEAF_COUNT - 1) * LEAF_STEP;
const LEAF_SEGMENT_COUNT = 20;
const LEAF_SEGMENT_OVERLAP = 0.006;
const LEAF_SPINE_SHOULDER_X = 0.01;
const LEAF_SPINE_SHOULDER_Y = 0.012;

// ─── Segment widths (computed once at module scope) ─────────────
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
	return weights.map((w) => (w / totalWeight) * totalWidth);
}

const SEGMENT_WIDTHS = createSegmentWidths(PAGE_W, LEAF_SEGMENT_COUNT, 0.75, 1.2);

// Pre-create shared geometries (all 8 pages use the same segment dimensions)
const SEGMENT_GEOS = SEGMENT_WIDTHS.map(
	(w) => new BoxGeometry(w + LEAF_SEGMENT_OVERLAP, LEAF_THICK, PAGE_D),
);

// Two shared leaf materials instead of 8 individual ones
const LEAF_MAT_LIGHT = new MeshStandardMaterial({ color: new Color("#f0e8d8"), roughness: 1.0 });
const LEAF_MAT_DARK = new MeshStandardMaterial({ color: new Color("#e4dcc8"), roughness: 1.0 });

/** Dictionary → links to /word-of-the-day
 *
 *  Lies flat. Spine binding on the left.
 *  Pages use elastica-inspired rational angle remap for natural curves.
 */
export function createDictionary(): DictionaryObject {
	const dictionary = new Group();
	applySectionInteraction(dictionary, "wordOfTheDay");

	const totalThickness = COVER_THICK * 2 + BASE_PAGE_THICK + PACKET_THICK + 0.002;

	// ─── Spine block ─────────────────────────────────────────────
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

	// Gold label on spine
	const spineLabel = new Mesh(
		new PlaneGeometry(DEPTH * 0.45, totalThickness * 0.35),
		dictionaryGoldMaterial,
	);
	spineLabel.rotation.y = Math.PI / 2;
	spineLabel.position.set(-WIDTH / 2 - SPINE_OVERHANG + 0.001, totalThickness / 2, 0);
	dictionary.add(spineLabel);

	// ─── Back cover ──────────────────────────────────────────────
	const backCover = new Mesh(
		new BoxGeometry(COVER_W, COVER_THICK, DEPTH),
		dictionaryLeatherMaterial,
	);
	backCover.position.set(HINGE_X + COVER_W / 2, COVER_THICK / 2, 0);
	backCover.castShadow = true;
	backCover.receiveShadow = true;
	dictionary.add(backCover);

	// ─── Base page block ─────────────────────────────────────────
	const basePages = new Mesh(
		new BoxGeometry(PAGE_W, BASE_PAGE_THICK, PAGE_D),
		dictionaryPagesMaterial,
	);
	basePages.position.set(HINGE_X + PAGE_W / 2, COVER_THICK + BASE_PAGE_THICK / 2, 0);
	dictionary.add(basePages);

	// ─── Page leaves ─────────────────────────────────────────────
	const pageLeaves: PageLeaf[] = [];
	for (let i = 0; i < LEAF_COUNT; i++) {
		const t = i / (LEAF_COUNT - 1);
		const leafMat = t < 0.5 ? LEAF_MAT_LIGHT : LEAF_MAT_DARK;

		const pageY = COVER_THICK + BASE_PAGE_THICK * (0.95 - t * 0.55);
		const pageX = HINGE_X + 0.002 + t * LEAF_SPINE_SHOULDER_X;
		const flipPivot = new Group();
		flipPivot.position.set(pageX, pageY + t * LEAF_SPINE_SHOULDER_Y, 0);
		flipPivot.visible = false;
		dictionary.add(flipPivot);

		const curveJoints: Group[] = [];
		let parent: Group = flipPivot;

		for (let seg = 0; seg < SEGMENT_WIDTHS.length; seg++) {
			const segW = SEGMENT_WIDTHS[seg];
			// Reuse shared geometry
			const segment = new Mesh(SEGMENT_GEOS[seg], leafMat);
			const offsetY = seg === 0 ? LEAF_THICK / 2 : 0;
			segment.position.set(segW / 2, offsetY, 0);
			segment.castShadow = true;
			segment.receiveShadow = true;
			parent.add(segment);

			if (seg === SEGMENT_WIDTHS.length - 1) continue;

			const joint = new Group();
			joint.position.set(segW, offsetY, 0);
			parent.add(joint);
			curveJoints.push(joint);
			parent = joint;
		}

		pageLeaves.push({ flipPivot, curveJoints });
	}

	// ─── Front cover ─────────────────────────────────────────────
	const frontCoverPivot = new Group();
	frontCoverPivot.position.set(HINGE_X, COVER_THICK + BASE_PAGE_THICK + PACKET_THICK + 0.002, 0);
	dictionary.add(frontCoverPivot);

	const frontCover = new Mesh(
		new BoxGeometry(COVER_W, COVER_THICK, DEPTH),
		dictionaryLeatherMaterial,
	);
	frontCover.position.set(COVER_W / 2, COVER_THICK / 2, 0);
	frontCover.castShadow = true;
	frontCover.receiveShadow = true;
	frontCoverPivot.add(frontCover);

	// Gold border
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

	// ─── Position on desk ────────────────────────────────────────
	dictionary.position.set(-0.8, DESK_SURFACE_Y, -0.5);
	dictionary.rotation.y = 0.15;

	return {
		root: dictionary,
		parts: { frontCoverPivot, pageLeaves, basePageBlock: basePages },
	};
}
