import {
	BoxGeometry,
	Color,
	CylinderGeometry,
	DoubleSide,
	Group,
	Mesh,
	MeshStandardMaterial,
	type Object3D,
	PlaneGeometry,
	SphereGeometry,
	TorusGeometry,
} from "three";
import type { SectionId } from "../../config";
import type { ShelfBook } from "../../content/types";
import {
	BOOK_COLORS,
	CERAMIC,
	DARK_GRAY,
	DARK_METAL,
	SCREEN_BLUE,
	SCREEN_GLOW,
	SHELL_FLOOR,
	SHELL_RETURN,
	SHELL_SHADOW,
	SHELL_WALL,
} from "../colors";
import { addHitbox } from "../hitbox";
import { applySectionInteraction } from "../interactive-section";
import {
	accentMaterial,
	cameraBodyMaterial,
	createBookMaterial,
	darkMetalMaterial,
	metalMaterial,
	paperMaterial,
	shelfNotebookCoverMaterial,
	shelfWoodMaterial,
	spiralRingMaterial,
} from "../materials";
import { SHELF_BOT_Y, SHELF_MID_Y, SHELF_TOP_Y, SHELF_WALL_X, SHELF_WALL_Z } from "../shelf-layout";
import { createSpineTexture } from "../spine-texture";

export interface ShelfWallResult {
	wall: Group;
	entries: ShelfSceneEntry[];
}

export interface ShelfSceneEntry {
	sectionId: SectionId;
	/** Override the section's default href (e.g. camera → /photos/camera). */
	href?: string;
	/** Source identifier passed to the modal (e.g. "camera"). */
	source?: string;
	target: Group;
	item: Object3D;
}

const WALL_W = 4.8;
const WALL_H = 5.2;
const FLOOR_Y = -2;
const BLEND_WALL_W = 7.4;
const BLEND_WALL_H = WALL_H - FLOOR_Y + 0.7;
const FLOOR_W = 7.4;
const FLOOR_D = 7.2;
const RETURN_W = 4.2;
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

	// Back cover
	const backCover = new Mesh(new BoxGeometry(0.45, 0.6, 0.02), accentMaterial);
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
	body.rotation.x = -0.28;
	g.position.set(0, 0.29, -0.01);
	return g;
}

function createShelfLaptop(): Group {
	const g = new Group();

	// Base (closed laptop lying flat)
	const base = new Mesh(new BoxGeometry(0.6, 0.025, 0.4), metalMaterial);
	g.add(base);

	// Top lid
	const lidMat = new MeshStandardMaterial({
		color: new Color(DARK_GRAY),
		roughness: 0.4,
		metalness: 0.6,
	});
	const lid = new Mesh(new BoxGeometry(0.6, 0.015, 0.4), lidMat);
	lid.position.y = 0.02;
	g.add(lid);

	// Small logo/accent on lid
	const logo = new Mesh(
		new BoxGeometry(0.08, 0.003, 0.08),
		new MeshStandardMaterial({
			color: new Color(SCREEN_GLOW),
			emissive: new Color(SCREEN_GLOW),
			emissiveIntensity: 0.5,
			roughness: 0.2,
		}),
	);
	logo.position.set(0, 0.03, 0);
	g.add(logo);

	g.position.set(0, 0.02, 0);
	return g;
}

function createShelfCamera(): Group {
	const g = new Group();

	const body = new Mesh(new BoxGeometry(0.45, 0.28, 0.22), cameraBodyMaterial);
	body.position.y = 0.14;
	g.add(body);

	const lensMat = new MeshStandardMaterial({
		color: new Color(DARK_METAL),
		roughness: 0.3,
		metalness: 0.7,
	});
	const lens = new Mesh(new CylinderGeometry(0.07, 0.08, 0.1, 16), lensMat);
	lens.rotation.x = Math.PI / 2;
	lens.position.set(0, 0.14, 0.16);
	g.add(lens);

	const glassMat = new MeshStandardMaterial({
		color: new Color(SCREEN_BLUE),
		roughness: 0.05,
		metalness: 0.3,
		transparent: true,
		opacity: 0.7,
	});
	const glass = new Mesh(new CylinderGeometry(0.055, 0.055, 0.012, 16), glassMat);
	glass.rotation.x = Math.PI / 2;
	glass.position.set(0, 0.14, 0.22);
	g.add(glass);

	const flash = new Mesh(
		new BoxGeometry(0.1, 0.05, 0.07),
		new MeshStandardMaterial({ color: new Color(CERAMIC), roughness: 0.3, metalness: 0.2 }),
	);
	flash.position.set(0.09, 0.3, 0);
	g.add(flash);

	const viewfinder = new Mesh(new SphereGeometry(0.025, 8, 8), cameraBodyMaterial);
	viewfinder.position.set(-0.1, 0.3, 0);
	g.add(viewfinder);

	g.rotation.y = 0.15;
	return g;
}

function createShelfShell(): Group {
	const shell = new Group();

	const wallMaterial = new MeshStandardMaterial({
		color: new Color(SHELL_WALL),
		roughness: 1.0,
		metalness: 0.0,
		transparent: true,
		opacity: 0.2,
		depthWrite: false,
		side: DoubleSide,
	});
	const returnMaterial = new MeshStandardMaterial({
		color: new Color(SHELL_RETURN),
		roughness: 1.0,
		metalness: 0.0,
		transparent: true,
		opacity: 0.1,
		depthWrite: false,
		side: DoubleSide,
	});
	const floorMaterial = new MeshStandardMaterial({
		color: new Color(SHELL_FLOOR),
		roughness: 0.98,
		metalness: 0.0,
		transparent: true,
		opacity: 0.92,
		depthWrite: false,
	});

	const wallPlane = new Mesh(new PlaneGeometry(BLEND_WALL_W, BLEND_WALL_H), wallMaterial);
	wallPlane.position.set(WALL_X + 0.04, FLOOR_Y + BLEND_WALL_H / 2, WALL_Z);
	wallPlane.rotation.y = -Math.PI / 2;
	wallPlane.receiveShadow = true;
	shell.add(wallPlane);

	const returnWall = new Mesh(new PlaneGeometry(RETURN_W, BLEND_WALL_H), returnMaterial);
	returnWall.position.set(
		WALL_X - RETURN_W / 2 + 0.08,
		FLOOR_Y + BLEND_WALL_H / 2,
		WALL_Z - WALL_W / 2 - 1.4,
	);
	returnWall.receiveShadow = true;
	shell.add(returnWall);

	const floor = new Mesh(new PlaneGeometry(FLOOR_W, FLOOR_D), floorMaterial);
	floor.rotation.x = -Math.PI / 2;
	floor.position.set(WALL_X - FLOOR_W / 2 + 1.1, FLOOR_Y, WALL_Z);
	floor.receiveShadow = true;
	shell.add(floor);

	const wallShadow = new Mesh(
		new PlaneGeometry(WALL_W + 1.8, WALL_H + 0.6),
		new MeshStandardMaterial({
			color: new Color(SHELL_SHADOW),
			roughness: 1.0,
			metalness: 0.0,
			transparent: true,
			opacity: 0.08,
			depthWrite: false,
			side: DoubleSide,
		}),
	);
	wallShadow.position.set(WALL_X + 0.01, WALL_H / 2 + 0.15, WALL_Z);
	wallShadow.rotation.y = -Math.PI / 2;
	shell.add(wallShadow);

	return shell;
}

// ─── Main builder ────────────────────────────────────────────────
export function createShelfWall(books?: ShelfBook[]): ShelfWallResult {
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
		},
		{
			sectionId: "projects" as const,
			item: createShelfLaptop(),
			position: [SHELF_CENTER_X - 0.14, MID_Y + SHELF_THICK / 2 + 0.025, WALL_Z + 0.62] as const,
			rotationY: -Math.PI / 2,
			hitboxPadding: 0.1,
		},
		{
			sectionId: "photos" as const,
			href: "/photos/camera",
			source: "camera",
			item: createShelfCamera(),
			position: [SHELF_CENTER_X - 0.02, BOT_Y + SHELF_THICK / 2, WALL_Z] as const,
			rotationY: -Math.PI / 2,
			hitboxPadding: 0.1,
		},
	];

	for (const layout of shelfLayouts) {
		const target = new Group();
		applySectionInteraction(target, layout.sectionId);
		layout.item.position.set(layout.position[0], layout.position[1], layout.position[2]);
		layout.item.rotation.y = layout.rotationY;
		enableShadows(layout.item);
		target.add(layout.item);
		addHitbox(target, layout.hitboxPadding);
		wall.add(target);
		entries.push({
			sectionId: layout.sectionId,
			href: layout.href,
			source: layout.source,
			target,
			item: layout.item,
		});
	}

	return { wall, entries };
}
