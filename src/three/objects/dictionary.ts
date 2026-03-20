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
import { DICTIONARY_GOLD, DICTIONARY_LEATHER } from "../colors";
import { applySectionInteraction } from "../interactive-section";
import {
	dictionaryGoldMaterial,
	dictionaryLeatherMaterial,
	dictionaryPagesMaterial,
} from "../materials";
import { DESK_SURFACE_Y } from "../math-utils";
import { createSpineTexture } from "../spine-texture";

export interface DictionaryObject {
	root: Group;
	parts: {
		coverPivot: Group;
		/** Individual loose pages that can fan/riffle during animation. */
		loosePages: Group[];
		/** The ribbon bookmark mesh. */
		ribbon: Mesh;
	};
}

const WIDTH = 0.55;
const DEPTH = 0.7;
const THICKNESS = 0.16;
const COVER_THICK = 0.016;
const PAGES_HEIGHT = THICKNESS - COVER_THICK * 2;
const SPINE_RADIUS = COVER_THICK * 1.2;
const LOOSE_PAGE_COUNT = 12;

/** Dictionary → links to /word-of-the-day
 *  A thick leather-bound dictionary with rounded spine, gold foil details,
 *  visible page edges, and a ribbon bookmark. Sits on the desk.
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

	// Gold border inset on bottom cover (face-down, barely visible but adds detail)
	const bottomBorderGeo = new PlaneGeometry(WIDTH - 0.06, DEPTH - 0.06);
	const bottomBorder = new Mesh(
		bottomBorderGeo,
		new MeshStandardMaterial({
			color: new Color(DICTIONARY_GOLD),
			roughness: 0.35,
			metalness: 0.5,
			transparent: true,
			opacity: 0.3,
			side: DoubleSide,
		}),
	);
	bottomBorder.rotation.x = -Math.PI / 2;
	bottomBorder.position.set(0, COVER_THICK + 0.001, 0);
	dictionary.add(bottomBorder);

	// ─── Page block ──────────────────────────────────────────────
	const pageBlock = new Mesh(
		new BoxGeometry(WIDTH - 0.03, PAGES_HEIGHT, DEPTH - 0.03),
		dictionaryPagesMaterial,
	);
	pageBlock.position.set(0, COVER_THICK + PAGES_HEIGHT / 2, 0);
	dictionary.add(pageBlock);

	// Visible page-edge lines on the open sides (front and right)
	const edgeLineMat = new MeshStandardMaterial({
		color: new Color("#d8d0c0"),
		roughness: 1.0,
		metalness: 0.0,
	});
	for (let i = 0; i < 8; i++) {
		const t = (i + 1) / 9;
		const y = COVER_THICK + PAGES_HEIGHT * t;
		// Front edge line
		const frontEdge = new Mesh(new BoxGeometry(WIDTH - 0.04, 0.001, 0.002), edgeLineMat);
		frontEdge.position.set(0, y, DEPTH / 2 - 0.015);
		dictionary.add(frontEdge);
		// Right edge line
		const rightEdge = new Mesh(new BoxGeometry(0.002, 0.001, DEPTH - 0.04), edgeLineMat);
		rightEdge.position.set(WIDTH / 2 - 0.015, y, 0);
		dictionary.add(rightEdge);
	}

	// ─── Rounded spine ───────────────────────────────────────────
	const spineGeo = new CylinderGeometry(
		SPINE_RADIUS,
		SPINE_RADIUS,
		WIDTH - 0.01,
		8,
		1,
		false,
		0,
		Math.PI,
	);
	const spineMesh = new Mesh(spineGeo, dictionaryLeatherMaterial);
	spineMesh.rotation.z = Math.PI / 2;
	spineMesh.rotation.y = Math.PI / 2;
	spineMesh.position.set(0, COVER_THICK + PAGES_HEIGHT / 2, -DEPTH / 2 + 0.005);
	dictionary.add(spineMesh);

	// Gold bands on spine
	for (const yOff of [-0.15, 0, 0.15]) {
		const band = new Mesh(
			new CylinderGeometry(
				SPINE_RADIUS + 0.001,
				SPINE_RADIUS + 0.001,
				0.02,
				8,
				1,
				false,
				0,
				Math.PI,
			),
			dictionaryGoldMaterial,
		);
		band.rotation.z = Math.PI / 2;
		band.rotation.y = Math.PI / 2;
		band.position.set(yOff, COVER_THICK + PAGES_HEIGHT / 2, -DEPTH / 2 + 0.005);
		dictionary.add(band);
	}

	// ─── Spine label with text ───────────────────────────────────
	const spineLabelMat = createSpineTexture("DICTIONARY", DICTIONARY_LEATHER, WIDTH * 0.7, 0.06, {
		fontSize: (cw) => Math.round(cw * 0.55),
		maxTextWidth: (_cw, ch) => ch * 5,
		textRotation: -Math.PI / 2,
		material: { roughness: 0.6, metalness: 0.15 },
	});
	const spineLabel = new Mesh(new PlaneGeometry(WIDTH * 0.6, 0.05), spineLabelMat);
	spineLabel.rotation.y = Math.PI / 2;
	spineLabel.rotation.z = Math.PI / 2;
	spineLabel.position.set(0, COVER_THICK + PAGES_HEIGHT / 2, -DEPTH / 2 - SPINE_RADIUS * 0.6);
	dictionary.add(spineLabel);

	// ─── Top cover with pivot at spine ───────────────────────────
	const coverPivot = new Group();
	coverPivot.position.set(0, COVER_THICK + PAGES_HEIGHT, -DEPTH / 2);
	dictionary.add(coverPivot);

	const topCover = new Mesh(new BoxGeometry(WIDTH, COVER_THICK, DEPTH), dictionaryLeatherMaterial);
	topCover.position.set(0, COVER_THICK / 2, DEPTH / 2);
	topCover.castShadow = true;
	coverPivot.add(topCover);

	// Gold border inset on top cover
	const topBorderGeo = new PlaneGeometry(WIDTH - 0.06, DEPTH - 0.06);
	const topBorder = new Mesh(
		topBorderGeo,
		new MeshStandardMaterial({
			color: new Color(DICTIONARY_GOLD),
			roughness: 0.3,
			metalness: 0.55,
			transparent: true,
			opacity: 0.4,
			side: DoubleSide,
		}),
	);
	topBorder.rotation.x = -Math.PI / 2;
	topBorder.position.set(0, COVER_THICK + 0.001, DEPTH / 2);
	coverPivot.add(topBorder);

	// Gold title bar on top cover
	const titleBar = new Mesh(new PlaneGeometry(WIDTH * 0.55, 0.04), dictionaryGoldMaterial);
	titleBar.rotation.x = -Math.PI / 2;
	titleBar.position.set(0, COVER_THICK + 0.002, DEPTH * 0.55);
	coverPivot.add(titleBar);

	// Second gold line below title
	const subtitleBar = new Mesh(new PlaneGeometry(WIDTH * 0.3, 0.015), dictionaryGoldMaterial);
	subtitleBar.rotation.x = -Math.PI / 2;
	subtitleBar.position.set(0, COVER_THICK + 0.002, DEPTH * 0.42);
	coverPivot.add(subtitleBar);

	// ─── Loose pages for riffle animation ────────────────────────
	const loosePages: Group[] = [];
	for (let i = 0; i < LOOSE_PAGE_COUNT; i++) {
		const pagePivot = new Group();
		// Pivot at the spine edge (back of the page)
		pagePivot.position.set(0, COVER_THICK + PAGES_HEIGHT * 0.5, -DEPTH / 2 + 0.02);
		dictionary.add(pagePivot);

		const pageGeo = new PlaneGeometry(WIDTH - 0.05, DEPTH - 0.05);
		const pageMat = new MeshStandardMaterial({
			color: new Color("#f2ece0"),
			roughness: 1.0,
			metalness: 0.0,
			side: DoubleSide,
			transparent: true,
			opacity: 0.85,
		});
		const page = new Mesh(pageGeo, pageMat);
		page.position.set(0, 0, (DEPTH - 0.05) / 2);
		page.rotation.x = -Math.PI / 2;
		pagePivot.add(page);

		loosePages.push(pagePivot);
	}

	// ─── Ribbon bookmark ─────────────────────────────────────────
	const ribbonMat = new MeshStandardMaterial({
		color: new Color("#8b1a1a"),
		roughness: 0.7,
		metalness: 0.05,
		side: DoubleSide,
	});
	const ribbon = new Mesh(new PlaneGeometry(0.018, DEPTH * 0.35), ribbonMat);
	ribbon.rotation.x = -0.15;
	ribbon.position.set(0.05, COVER_THICK + PAGES_HEIGHT + COVER_THICK + 0.001, DEPTH * 0.28);
	dictionary.add(ribbon);

	// ─── Position on desk — front-right, angled toward viewer ───
	dictionary.position.set(-0.3, DESK_SURFACE_Y, -0.7);
	dictionary.rotation.y = 0.35;

	return {
		root: dictionary,
		parts: {
			coverPivot,
			loosePages,
			ribbon,
		},
	};
}
