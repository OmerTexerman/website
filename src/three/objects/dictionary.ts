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
		/** The whole body group that tips forward. Pivot is at the bottom-front edge. */
		bodyPivot: Group;
		/** Individual loose pages that cascade after the slam. */
		loosePages: Group[];
	};
}

// Standing upright dimensions
const WIDTH = 0.5; // X — left to right
const HEIGHT = 0.65; // Y — how tall it stands
const THICKNESS = 0.14; // Z — how thick the book is
const COVER_THICK = 0.014;
const PAGES_DEPTH = THICKNESS - COVER_THICK * 2;
const SPINE_RADIUS = COVER_THICK * 1.4;
const LOOSE_PAGE_COUNT = 10;

/** Dictionary → links to /word-of-the-day
 *
 *  Stands upright on the desk like a book on display.
 *  Animation: tips forward, slams flat, pages cascade from the impact.
 */
export function createDictionary(): DictionaryObject {
	const dictionary = new Group();
	applySectionInteraction(dictionary, "wordOfTheDay");

	// The body pivot sits at the bottom-front edge of the book
	// so the book tips forward (toward +Z) when rotated around X.
	const bodyPivot = new Group();
	bodyPivot.position.set(0, 0, THICKNESS / 2);
	dictionary.add(bodyPivot);

	// Everything inside bodyPivot is positioned relative to the pivot
	// (bottom-front edge). The book extends upward (+Y) and backward (-Z).
	const body = new Group();
	bodyPivot.add(body);

	// ─── Back cover (the one facing away from viewer) ────────────
	const backCover = new Mesh(
		new BoxGeometry(WIDTH, HEIGHT, COVER_THICK),
		dictionaryLeatherMaterial,
	);
	backCover.position.set(0, HEIGHT / 2, -THICKNESS + COVER_THICK / 2);
	backCover.castShadow = true;
	body.add(backCover);

	// ─── Page block ──────────────────────────────────────────────
	const pageBlock = new Mesh(
		new BoxGeometry(WIDTH - 0.02, HEIGHT - 0.02, PAGES_DEPTH),
		dictionaryPagesMaterial,
	);
	pageBlock.position.set(0, HEIGHT / 2, -THICKNESS / 2);
	body.add(pageBlock);

	// Page-edge lines visible on top and right side
	const edgeLineMat = new MeshStandardMaterial({
		color: new Color("#d8d0c0"),
		roughness: 1.0,
	});
	for (let i = 0; i < 10; i++) {
		const t = (i + 1) / 11;
		const z = -THICKNESS + COVER_THICK + PAGES_DEPTH * t;
		// Top edge lines
		const topEdge = new Mesh(new BoxGeometry(WIDTH - 0.03, 0.001, 0.001), edgeLineMat);
		topEdge.position.set(0, HEIGHT - 0.01, z);
		body.add(topEdge);
		// Right side edge lines
		const rightEdge = new Mesh(new BoxGeometry(0.001, HEIGHT - 0.03, 0.001), edgeLineMat);
		rightEdge.position.set(WIDTH / 2 - 0.01, HEIGHT / 2, z);
		body.add(rightEdge);
	}

	// ─── Front cover (facing viewer) ─────────────────────────────
	const frontCover = new Mesh(
		new BoxGeometry(WIDTH, HEIGHT, COVER_THICK),
		dictionaryLeatherMaterial,
	);
	frontCover.position.set(0, HEIGHT / 2, -COVER_THICK / 2);
	frontCover.castShadow = true;
	body.add(frontCover);

	// Gold border frame on front cover
	const borderMat = new MeshStandardMaterial({
		color: new Color(DICTIONARY_GOLD),
		roughness: 0.3,
		metalness: 0.55,
		transparent: true,
		opacity: 0.5,
		side: DoubleSide,
	});
	const frontBorder = new Mesh(new PlaneGeometry(WIDTH - 0.05, HEIGHT - 0.05), borderMat);
	frontBorder.position.set(0, HEIGHT / 2, -0.0001);
	body.add(frontBorder);

	// Gold title text area on front cover
	const titleBlock = new Mesh(new PlaneGeometry(WIDTH * 0.6, 0.06), dictionaryGoldMaterial);
	titleBlock.position.set(0, HEIGHT * 0.65, -0.0002);
	body.add(titleBlock);

	// Second gold line (subtitle)
	const subtitleBlock = new Mesh(new PlaneGeometry(WIDTH * 0.35, 0.025), dictionaryGoldMaterial);
	subtitleBlock.position.set(0, HEIGHT * 0.55, -0.0002);
	body.add(subtitleBlock);

	// ─── Spine (left side, rounded) ──────────────────────────────
	const spineGeo = new CylinderGeometry(
		SPINE_RADIUS,
		SPINE_RADIUS,
		HEIGHT - 0.01,
		8,
		1,
		false,
		0,
		Math.PI,
	);
	const spineMesh = new Mesh(spineGeo, dictionaryLeatherMaterial);
	spineMesh.rotation.z = Math.PI;
	spineMesh.position.set(-WIDTH / 2, HEIGHT / 2, -THICKNESS / 2);
	body.add(spineMesh);

	// Gold bands on spine
	for (const yOff of [HEIGHT * 0.2, HEIGHT * 0.5, HEIGHT * 0.8]) {
		const band = new Mesh(
			new CylinderGeometry(
				SPINE_RADIUS + 0.001,
				SPINE_RADIUS + 0.001,
				0.015,
				8,
				1,
				false,
				0,
				Math.PI,
			),
			dictionaryGoldMaterial,
		);
		band.rotation.z = Math.PI;
		band.position.set(-WIDTH / 2, yOff, -THICKNESS / 2);
		body.add(band);
	}

	// Spine label text
	const spineLabelMat = createSpineTexture("DICTIONARY", DICTIONARY_LEATHER, HEIGHT * 0.6, 0.05, {
		fontSize: (cw) => Math.round(cw * 0.5),
		maxTextWidth: (_cw, ch) => ch * 5,
		textRotation: -Math.PI / 2,
		material: { roughness: 0.6, metalness: 0.15 },
	});
	const spineLabel = new Mesh(new PlaneGeometry(HEIGHT * 0.5, 0.04), spineLabelMat);
	spineLabel.rotation.y = -Math.PI / 2;
	spineLabel.position.set(-WIDTH / 2 - SPINE_RADIUS * 0.7, HEIGHT / 2, -THICKNESS / 2);
	body.add(spineLabel);

	// ─── Loose pages for cascade animation ───────────────────────
	// These are initially flat inside the book (invisible), and fan out
	// during the slam animation.
	const loosePages: Group[] = [];
	for (let i = 0; i < LOOSE_PAGE_COUNT; i++) {
		const pagePivot = new Group();
		// Pivot at the spine side of the page block
		pagePivot.position.set(-WIDTH / 2 + 0.02, HEIGHT / 2, -THICKNESS / 2);
		// Initially rotated to lie flat inside the book (no visible effect)
		pagePivot.rotation.y = 0;
		body.add(pagePivot);

		const pageMat = new MeshStandardMaterial({
			color: new Color("#f2ece0"),
			roughness: 1.0,
			side: DoubleSide,
			transparent: true,
			opacity: 0.8,
		});
		const page = new Mesh(new PlaneGeometry(WIDTH - 0.06, HEIGHT - 0.04), pageMat);
		// Offset from pivot so the page extends rightward (+X)
		page.position.set((WIDTH - 0.06) / 2, 0, 0);
		pagePivot.add(page);

		loosePages.push(pagePivot);
	}

	// ─── Position on desk ────────────────────────────────────────
	// Front area of desk, slightly left of center, angled toward viewer
	// Between notebook (-1.5, z=0.5) and laptop (0.5, z=-0.3),
	// behind the mug (-0.6, z=0.9)
	dictionary.position.set(-0.5, DESK_SURFACE_Y, -0.4);
	dictionary.rotation.y = 0.2;

	return {
		root: dictionary,
		parts: {
			bodyPivot,
			loosePages,
		},
	};
}
