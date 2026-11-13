import {
	Box3,
	BoxGeometry,
	CanvasTexture,
	Group,
	Mesh,
	MeshBasicMaterial,
	type Object3D,
	PlaneGeometry,
	TorusGeometry,
} from "three";
import { type SectionId, site } from "../../config";
import type { ShelfBook, SpotlightInfo } from "../../content/types";
import {
	animateClockSpin,
	animateFrameWobble,
	animateHeadphonePulse,
	animateSignWiggle,
} from "../animations";
import { BOOK_COLORS } from "../colors";
import { addHitbox } from "../hitbox";
import { applySectionInteraction } from "../interactive-section";
import {
	createBookMaterial,
	darkMetalMaterial,
	dictionaryGoldMaterial,
	dictionaryLeatherMaterial,
	dictionaryPagesMaterial,
	paperMaterial,
	shelfNotebookCoverMaterial,
	shelfWoodMaterial,
	spiralRingMaterial,
} from "../materials";
import { createRoomWall } from "../room-wall";
import { SHELF_BOT_Y, SHELF_MID_Y, SHELF_TOP_Y, SHELF_WALL_X, SHELF_WALL_Z } from "../shelf-layout";
import { createSpineTexture } from "../spine-texture";
import { createGreetingSign } from "./greeting-sign";
import { createWallIdBadge } from "./id-badge";
import { createShelfCamera } from "./shelf-camera";
import { createShelfCandle, toggleCandle } from "./shelf-candle";
import { createShelfClock, syncClockToTime } from "./shelf-clock";
import { createShelfHeadphones } from "./shelf-headphones";
import { createShelfPhone } from "./shelf-phone";
import { createShelfSpotlightFrame } from "./spotlight-frame";

export interface ShelfDecorEntry {
	label: string;
	target: Group;
	activate: () => void;
}

export interface ShelfWallResult {
	wall: Group;
	/** The hanging badge's idle-sway and click-swing pivots. */
	badgeSway: Object3D;
	badgeSwing: Object3D;
	entries: ShelfSceneEntry[];
	decor: ShelfDecorEntry[];
	cleanup?: () => void;
}

export interface ShelfSceneEntry {
	sectionId: SectionId;
	/** Override the section's default href (e.g. phone → /projects/phone). */
	href?: string;
	/** Source identifier passed to the modal (e.g. "camera"). */
	source?: string;
	target: Group;
	item: Object3D;
	/** How far the item must slide out (toward -x, in its target's space)
	 *  before its back edge clears the front of the shelf, so a fall never
	 *  passes through the plank. */
	frontClearance: number;
}

const _clearanceBox = new Box3();
const SHELF_W = 3.8;
const SHELF_DEPTH = 0.55;
const SHELF_THICK = 0.06;
const BRACKET_SIZE = 0.08;
const WALL_X = SHELF_WALL_X;
const WALL_Z = SHELF_WALL_Z;
const SHELF_CENTER_X = WALL_X - SHELF_DEPTH / 2;
const TOP_Y = SHELF_TOP_Y;
const MID_Y = SHELF_MID_Y;
const BOT_Y = SHELF_BOT_Y;

/** Top surface of the plank at or just below `y`. */
function shelfTopBelow(y: number): number {
	const tops = [BOT_Y, MID_Y, TOP_Y].map((plank) => plank + SHELF_THICK / 2);
	return tops.filter((top) => top <= y + 0.001).pop() ?? tops[0];
}

/** A soft dark blob, darkest in the middle, for under things resting on a shelf. */
function contactShadowMaterial(strength = 0.55): MeshBasicMaterial {
	const canvas = document.createElement("canvas");
	canvas.width = 64;
	canvas.height = 64;
	const ctx = canvas.getContext("2d");
	if (ctx) {
		const fade = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
		fade.addColorStop(0, `rgba(0,0,0,${strength})`);
		fade.addColorStop(0.5, `rgba(0,0,0,${strength * 0.7})`);
		fade.addColorStop(1, "rgba(0,0,0,0)");
		ctx.fillStyle = fade;
		ctx.fillRect(0, 0, 64, 64);
	}
	return new MeshBasicMaterial({
		map: new CanvasTexture(canvas),
		transparent: true,
		depthWrite: false,
	});
}

function enableShadows(obj: Object3D): void {
	obj.traverse((child) => {
		if (!(child instanceof Mesh)) return;
		child.castShadow = true;
		child.receiveShadow = true;
	});
}

// ─── Shelf plank with L-bracket supports ─────────────────────────
function createShelfPlank(y: number): Group {
	const g = new Group();

	// Plank
	const plank = new Mesh(new BoxGeometry(SHELF_W, SHELF_THICK, SHELF_DEPTH), shelfWoodMaterial);
	plank.position.set(0, y, 0);
	plank.castShadow = true;
	g.add(plank);

	// L-brackets (2 per shelf)
	for (const xOff of [-SHELF_W * 0.35, SHELF_W * 0.35]) {
		// Vertical part
		const vert = new Mesh(
			new BoxGeometry(BRACKET_SIZE * 0.4, BRACKET_SIZE * 2, BRACKET_SIZE * 0.4),
			darkMetalMaterial,
		);
		vert.position.set(xOff, y - SHELF_THICK / 2 - BRACKET_SIZE, -SHELF_DEPTH / 2 + 0.05);
		g.add(vert);

		// Horizontal part
		const horiz = new Mesh(
			new BoxGeometry(BRACKET_SIZE * 0.4, BRACKET_SIZE * 0.4, SHELF_DEPTH * 0.6),
			darkMetalMaterial,
		);
		horiz.position.set(xOff, y - SHELF_THICK / 2 - BRACKET_SIZE * 0.2, 0);
		g.add(horiz);
	}

	g.rotation.y = -Math.PI / 2;
	return g;
}

// ─── Shelf items ─────────────────────────────────────────────────

/** Shelf shows at most 4 books from the shared palette */
const SHELF_BOOK_COLORS = BOOK_COLORS.slice(0, 4);

function createShelfBooks(books?: ShelfBook[]): Group {
	const g = new Group();
	const count = books ? Math.min(books.length, 4) : SHELF_BOOK_COLORS.length;

	for (let i = 0; i < count; i++) {
		const color = books?.[i]?.spineColor ?? SHELF_BOOK_COLORS[i];
		const title = books?.[i]?.title ?? "";
		const bookH = 0.55 + i * 0.04;
		const bookW = 0.12 + ((i * 3 + 1) % 3) * 0.02;
		const bookD = 0.35;

		const book = new Mesh(new BoxGeometry(bookW, bookH, bookD), createBookMaterial(color));
		const xPos = -0.35 + i * 0.22;
		book.position.set(xPos, bookH / 2, 0);
		// Slight lean
		book.rotation.z = (((i * 7 + 2) % 5) - 2) * 0.03;
		g.add(book);

		// Spine label on front face
		if (title) {
			const spineMat = createSpineTexture(title, color, bookW, bookH, {
				fontSize: (canvasWidth) => Math.round(canvasWidth * 0.72),
				maxTextWidth: (_canvasWidth, canvasHeight) => canvasHeight * 0.82,
				textRotation: -Math.PI / 2,
			});
			const spineGeo = new PlaneGeometry(bookW * 0.8, bookH * 0.78);
			const spine = new Mesh(spineGeo, spineMat);
			spine.position.set(xPos, bookH / 2, bookD / 2 + 0.001);
			spine.rotation.z = book.rotation.z;
			g.add(spine);
		}
	}

	return g;
}

const NOTEBOOK_LEAN = 0.28;
/** Front of the cover to the back of the back cover. */
const NOTEBOOK_THICKNESS = 0.065;

function createShelfNotebook(): Group {
	const g = new Group();
	const body = new Group();
	g.add(body);

	// Cover
	const cover = new Mesh(new BoxGeometry(0.45, 0.6, 0.03), shelfNotebookCoverMaterial);
	body.add(cover);

	// Pages
	const pages = new Mesh(new BoxGeometry(0.41, 0.56, 0.04), paperMaterial);
	pages.position.z = -0.02;
	body.add(pages);

	// Back cover, the same red as the front: in a lighter shade its bottom
	// edge showed under the front cover like a separate slab, and the cover
	// looked lifted off the shelf.
	const backCover = new Mesh(new BoxGeometry(0.45, 0.6, 0.02), shelfNotebookCoverMaterial);
	backCover.position.z = -0.04;
	body.add(backCover);

	// Spiral rings
	const ringGeo = new TorusGeometry(0.02, 0.004, 6, 10);
	for (let i = 0; i < 5; i++) {
		const ring = new Mesh(ringGeo, spiralRingMaterial);
		ring.position.set(-0.18 + i * 0.08, 0.3, -0.01);
		body.add(ring);
	}

	// Lean back into the wall so it feels like it is resting on the shelf.
	body.rotation.x = -NOTEBOOK_LEAN;
	g.position.set(0, 0.29, -0.01);
	// Tipped back, it rests on its rear bottom edge and the front cover's
	// edge lifts off the plank, which reads as hovering. The shelf sinks it
	// by this much so the front edge sits on the plank (the rear edge dips
	// in, out of sight).
	g.userData.restSink = NOTEBOOK_THICKNESS * Math.sin(NOTEBOOK_LEAN);
	return g;
}

function createShelfDictionary(): Group {
	const g = new Group();

	// Lying flat on the shelf — simple, clean
	const w = 0.38;
	const h = 0.1;
	const d = 0.3;
	const coverThick = 0.01;

	// Bottom cover
	const bottom = new Mesh(new BoxGeometry(w, coverThick, d), dictionaryLeatherMaterial);
	bottom.position.y = coverThick / 2;
	g.add(bottom);

	// Page block
	const pagesH = h - coverThick * 2;
	const pages = new Mesh(new BoxGeometry(w - 0.02, pagesH, d - 0.02), dictionaryPagesMaterial);
	pages.position.y = coverThick + pagesH / 2;
	g.add(pages);

	// Top cover
	const top = new Mesh(new BoxGeometry(w, coverThick, d), dictionaryLeatherMaterial);
	top.position.y = coverThick + pagesH + coverThick / 2;
	g.add(top);

	// Gold border on top cover
	const border = new Mesh(new PlaneGeometry(w - 0.04, d - 0.04), dictionaryGoldMaterial);
	border.rotation.x = -Math.PI / 2;
	border.position.set(0, h + 0.001, 0);
	g.add(border);

	// Gold title bar on top
	const titleBar = new Mesh(new PlaneGeometry(w * 0.5, 0.02), dictionaryGoldMaterial);
	titleBar.rotation.x = -Math.PI / 2;
	titleBar.position.set(0, h + 0.002, d * 0.12);
	g.add(titleBar);

	return g;
}

/** The wall the shelves hang on: the same plain room wall as behind the
 *  desk, with no backing panel or side wall to read as a cabinet. */
function createShelfShell(): Group {
	const shell = new Group();
	const wall = createRoomWall(40);
	wall.rotation.y = -Math.PI / 2;
	wall.position.x = WALL_X + 0.04;
	wall.position.z = WALL_Z;
	shell.add(wall);
	return shell;
}

function addDecorItem(
	parent: Group,
	item: Group,
	position: [number, number, number],
	label: string,
	activate: () => void,
	hitboxPadding = 0.06,
): ShelfDecorEntry {
	item.position.set(...position);
	item.rotation.y = -Math.PI / 2;
	enableShadows(item);
	const target = new Group();
	target.userData = { interactive: true };
	target.add(item);
	addHitbox(target, hitboxPadding);
	parent.add(target);
	return { label, target, activate };
}

// ─── Main builder ────────────────────────────────────────────────
export function createShelfWall(
	books?: ShelfBook[],
	spotlight?: SpotlightInfo | null,
): ShelfWallResult {
	const wall = new Group();
	wall.userData = { shelfWall: true };

	// Blended room shell for the side wall and floor.
	wall.add(createShelfShell());

	// Create shelf planks
	const shelves = createShelfPlank(TOP_Y);
	shelves.position.set(SHELF_CENTER_X, 0, WALL_Z);
	enableShadows(shelves);
	wall.add(shelves);

	const midShelves = createShelfPlank(MID_Y);
	midShelves.position.set(SHELF_CENTER_X, 0, WALL_Z);
	enableShadows(midShelves);
	wall.add(midShelves);

	const botShelves = createShelfPlank(BOT_Y);
	botShelves.position.set(SHELF_CENTER_X, 0, WALL_Z);
	enableShadows(botShelves);
	wall.add(botShelves);

	const entries: ShelfSceneEntry[] = [];
	const shelfLayouts = [
		{
			sectionId: "reading" as const,
			item: createShelfBooks(books),
			position: [SHELF_CENTER_X - 0.04, TOP_Y + SHELF_THICK / 2, WALL_Z] as const,
			rotationY: -Math.PI / 2,
			hitboxPadding: 0.1,
		},
		{
			sectionId: "blog" as const,
			item: createShelfNotebook(),
			position: [SHELF_CENTER_X + 0.08, MID_Y + SHELF_THICK / 2 + 0.28, WALL_Z - 0.54] as const,
			rotationY: -Math.PI / 2,
			hitboxPadding: 0.1,
			leansOnWall: true,
		},
		{
			sectionId: "projects" as const,
			href: "/projects/phone",
			source: "phone",
			item: createShelfPhone(),
			position: [SHELF_CENTER_X - 0.14, MID_Y + SHELF_THICK / 2 + 0.01, WALL_Z + 0.62] as const,
			rotationY: -Math.PI / 2,
			hitboxPadding: 0.1,
		},
		{
			sectionId: "photos" as const,
			// Opens the same corkboard as the desk, after a camera flash.
			source: "camera",
			item: createShelfCamera(),
			position: [SHELF_CENTER_X - 0.02, BOT_Y + SHELF_THICK / 2, WALL_Z - 0.5] as const,
			rotationY: -Math.PI / 2,
			hitboxPadding: 0.06,
		},
		{
			sectionId: "wordOfTheDay" as const,
			item: createShelfDictionary(),
			position: [SHELF_CENTER_X - 0.04, BOT_Y + SHELF_THICK / 2, WALL_Z + 0.35] as const,
			rotationY: -Math.PI / 2,
			hitboxPadding: 0.1,
		},
	];

	for (const layout of shelfLayouts) {
		const target = new Group();
		applySectionInteraction(target, layout.sectionId);
		target.position.set(layout.position[0], layout.position[1], layout.position[2]);
		layout.item.position.set(0, 0, 0);
		layout.item.rotation.y = layout.rotationY;
		enableShadows(layout.item);
		// Leaning items stand right under the shelf and sign above; the key
		// light threw their shadow across the top of the cover as a dark band.
		if ("leansOnWall" in layout && layout.leansOnWall) {
			layout.item.traverse((child) => {
				child.receiveShadow = false;
			});
		}
		target.add(layout.item);
		// Leaning items slide back until their top rests on the wall, rather
		// than tilting back into the air mid-shelf.
		if ("leansOnWall" in layout && layout.leansOnWall) {
			_clearanceBox.setFromObject(layout.item);
			target.position.x = WALL_X - 0.004 - _clearanceBox.max.x;
			// Sit exactly on the plank below, with a soft contact shadow where
			// it touches, so it reads as resting rather than hovering.
			const shelfTop = shelfTopBelow(layout.position[1]);
			const sink = (layout.item.userData.restSink as number | undefined) ?? 0;
			target.position.y = shelfTop - _clearanceBox.min.y - sink;
			const footprint = new Mesh(
				// A thin band along the base only. A wide blob reached out in front
				// and made the item look like it hovered over its own shadow.
				new PlaneGeometry(0.1, _clearanceBox.max.z - _clearanceBox.min.z + 0.06),
				contactShadowMaterial(0.6),
			);
			footprint.rotation.x = -Math.PI / 2;
			footprint.position.set(
				_clearanceBox.min.x + 0.04,
				_clearanceBox.min.y + sink + 0.002,
				(_clearanceBox.min.z + _clearanceBox.max.z) / 2,
			);
			footprint.renderOrder = 1;
			target.add(footprint);
			// And a soft shade on the wall behind it, nudged away from the key
			// light (which sits off to +z). Without it nothing ties the item to
			// the wall and, seen nearly face on, it looks like it is hovering.
			const height = _clearanceBox.max.y - _clearanceBox.min.y;
			const wallShade = new Mesh(
				new PlaneGeometry(_clearanceBox.max.z - _clearanceBox.min.z + 0.2, height + 0.12),
				contactShadowMaterial(0.85),
			);
			wallShade.rotation.y = -Math.PI / 2;
			wallShade.position.set(
				WALL_X - 0.003 - target.position.x,
				_clearanceBox.min.y + height / 2,
				(_clearanceBox.min.z + _clearanceBox.max.z) / 2 - 0.07,
			);
			wallShade.renderOrder = 1;
			target.add(wallShade);
		}
		// Measure before the hitbox is added and before the target joins the
		// scene (its world matrix is still identity), so the box is in target
		// space. Compare the item's back edge against the shelf's front edge (the plank spans
		// WALL_X - SHELF_DEPTH .. WALL_X along x).
		_clearanceBox.setFromObject(layout.item);
		const frontEdgeLocalX = WALL_X - SHELF_DEPTH - target.position.x;
		const frontClearance = Math.max(0, _clearanceBox.max.x - frontEdgeLocalX) + 0.04;
		addHitbox(target, layout.hitboxPadding);
		wall.add(target);
		entries.push({
			sectionId: layout.sectionId,
			href: layout.href,
			source: layout.source,
			target,
			item: layout.item,
			frontClearance,
		});
	}

	// ── Decorative micro-interaction items ──────────────────────
	const decor: ShelfDecorEntry[] = [];

	// Candle — top shelf, right side (next to books)
	const candle = createShelfCandle();
	decor.push(
		addDecorItem(
			wall,
			candle,
			[SHELF_CENTER_X + 0.06, TOP_Y + SHELF_THICK / 2, WALL_Z + 0.6],
			"Candle",
			() => {
				toggleCandle(candle);
			},
		),
	);
	// The jar is glass and the flame is the light source: neither should
	// throw a shadow.
	candle.traverse((child) => {
		if (child instanceof Mesh) child.castShadow = false;
	});

	// Greeting plaque hung just under the top shelf, left of the clock.
	const greeting = createGreetingSign({
		title: `hi, I'm ${site.name.split(" ")[0]}.`,
		line: "have a look around, ignore the dust.",
		width: 1.05,
		// No bloom on the shelf, so the sign draws its own glow.
		halo: 1,
	});
	decor.push(
		addDecorItem(wall, greeting, [WALL_X + 0.02, TOP_Y - 0.1, WALL_Z - 0.4], "Sign", () => {
			void animateSignWiggle(greeting);
		}),
	);

	// Clock — wall-mounted between top and mid shelves
	const clock = createShelfClock();
	const clockWallY = (TOP_Y + MID_Y) / 2;
	decor.push(
		addDecorItem(wall, clock, [WALL_X + 0.01, clockWallY, WALL_Z + 0.55], "Clock", () => {
			void animateClockSpin(clock);
		}),
	);

	// Headphones — bottom shelf, leaning against back wall (next to camera)
	const headphones = createShelfHeadphones();
	decor.push(
		addDecorItem(
			wall,
			headphones,
			[SHELF_CENTER_X + 0.16, BOT_Y + SHELF_THICK / 2, WALL_Z + 0.62],
			"Headphones",
			() => {
				void animateHeadphonePulse(headphones);
			},
		),
	);

	// Spotlight frame — wall-mounted between mid and bottom shelves
	const spotlightFrameGroup = createShelfSpotlightFrame(spotlight);
	// Big enough to hold the wall between the shelves, with a readable caption.
	spotlightFrameGroup.scale.setScalar(1.6);
	decor.push(
		addDecorItem(
			wall,
			spotlightFrameGroup,
			[WALL_X + 0.01, (MID_Y + BOT_Y) / 2 + 0.08, WALL_Z - 0.3],
			"Spotlight",
			() => {
				void animateFrameWobble(spotlightFrameGroup);
			},
		),
	);

	// ID badge with its lanyard draped over the bottom shelf's front edge,
	// running back under the dictionary: away from the name sign, and easy
	// to tap. Opens the about card.
	const badge = createWallIdBadge({ interactive: false, scale: 1, mount: "draped" });
	const badgeTarget = new Group();
	applySectionInteraction(badgeTarget, "about");
	badgeTarget.position.set(WALL_X - SHELF_DEPTH - 0.004, BOT_Y + SHELF_THICK / 2, WALL_Z + 0.3);
	badge.root.rotation.y = -Math.PI / 2;
	badgeTarget.add(badge.root);
	addHitbox(badgeTarget, 0.08);
	wall.add(badgeTarget);
	entries.push({
		sectionId: "about",
		source: "badge",
		target: badgeTarget,
		item: badge.root,
		frontClearance: 0,
	});

	// Resync clock hands to actual time every 30 s
	const clockSyncInterval = window.setInterval(() => syncClockToTime(clock), 30_000);

	return {
		wall,
		entries,
		decor,
		badgeSway: badge.parts.sway,
		badgeSwing: badge.parts.swing,
		cleanup: () => {
			window.clearInterval(clockSyncInterval);
		},
	};
}
