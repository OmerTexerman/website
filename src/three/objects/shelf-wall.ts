import {
	BoxGeometry,
	CanvasTexture,
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
import { addHitbox } from "../hitbox";
import {
	accentMaterial,
	createBookMaterial,
	darkMetalMaterial,
	metalMaterial,
	paperMaterial,
	shelfWoodMaterial,
} from "../materials";

export interface BookData {
	title: string;
	spineColor: string;
}

export interface ShelfWallResult {
	wall: Group;
	tapTargets: Object3D[];
	shelfItems: Object3D[];
}

// ─── Shelf geometry constants ────────────────────────────────────
const WALL_X = 5.35; // Room-local X position (to the right of desk)
const WALL_W = 4.8;
const WALL_H = 5.2;
const WALL_Z = 4.4;
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
const SHELF_CENTER_X = WALL_X - SHELF_DEPTH / 2;

const TOP_Y = 3.6;
const MID_Y = 2.2;
const BOT_Y = 0.8;

// ─── Spine texture (adapted from book-stack.ts) ──────────────────
function createSpineTexture(
	title: string,
	spineColor: string,
	width: number,
	height: number,
): MeshStandardMaterial {
	const canvas = document.createElement("canvas");
	const scale = 4;
	canvas.width = Math.round(width * 512 * scale);
	canvas.height = Math.round(height * 512 * scale);
	const ctx = canvas.getContext("2d");
	if (!ctx) return createBookMaterial(spineColor);

	ctx.fillStyle = spineColor;
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	ctx.fillStyle = "#ffffff";
	ctx.globalAlpha = 0.85;
	const fontSize = Math.round(canvas.width * 0.72);
	ctx.font = `500 ${fontSize}px 'Space Grotesk', sans-serif`;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";

	let displayTitle = title;
	while (ctx.measureText(displayTitle).width > canvas.height * 0.82 && displayTitle.length > 3) {
		displayTitle = `${displayTitle.slice(0, -4)}...`;
	}

	ctx.save();
	ctx.translate(canvas.width / 2, canvas.height / 2);
	ctx.rotate(-Math.PI / 2);
	ctx.fillText(displayTitle, 0, 0);
	ctx.restore();

	const texture = new CanvasTexture(canvas);
	return new MeshStandardMaterial({ map: texture, roughness: 0.7, metalness: 0.0 });
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

const BOOK_COLORS = ["#2a4a6a", "#6a3a3a", "#3a5a3a", "#5a4a3a"];

function createShelfBooks(books?: BookData[]): Group {
	const g = new Group();
	const count = books ? Math.min(books.length, 4) : BOOK_COLORS.length;

	for (let i = 0; i < count; i++) {
		const color = books?.[i]?.spineColor ?? BOOK_COLORS[i];
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
			const spineMat = createSpineTexture(title, color, bookW, bookH);
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

	// Cover
	const coverMat = new MeshStandardMaterial({ color: new Color("#9a3230"), roughness: 0.6 });
	const cover = new Mesh(new BoxGeometry(0.45, 0.6, 0.03), coverMat);
	g.add(cover);

	// Pages
	const pages = new Mesh(new BoxGeometry(0.41, 0.56, 0.04), paperMaterial);
	pages.position.z = -0.02;
	g.add(pages);

	// Back cover
	const backCover = new Mesh(new BoxGeometry(0.45, 0.6, 0.02), accentMaterial);
	backCover.position.z = -0.04;
	g.add(backCover);

	// Spiral rings
	const ringMat = new MeshStandardMaterial({
		color: new Color("#c0c0c0"),
		roughness: 0.3,
		metalness: 0.8,
	});
	const ringGeo = new TorusGeometry(0.02, 0.004, 6, 10);
	for (let i = 0; i < 5; i++) {
		const ring = new Mesh(ringGeo, ringMat);
		ring.position.set(-0.18 + i * 0.08, 0.3, -0.01);
		g.add(ring);
	}

	// Keep the notebook upright so it reads cleanly against the shelf.
	g.rotation.x = 0;
	g.position.set(0, 0.3, 0.02);
	return g;
}

function createShelfLaptop(): Group {
	const g = new Group();

	// Base (closed laptop lying flat)
	const base = new Mesh(new BoxGeometry(0.6, 0.025, 0.4), metalMaterial);
	g.add(base);

	// Top lid
	const lidMat = new MeshStandardMaterial({
		color: new Color("#3a3a3a"),
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
			color: new Color("#5a8aba"),
			emissive: new Color("#5a8aba"),
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

	const bodyMat = new MeshStandardMaterial({
		color: new Color("#1a1a1a"),
		roughness: 0.4,
		metalness: 0.6,
	});
	const body = new Mesh(new BoxGeometry(0.45, 0.28, 0.22), bodyMat);
	body.position.y = 0.14;
	g.add(body);

	const lensMat = new MeshStandardMaterial({
		color: new Color("#2a2a2a"),
		roughness: 0.3,
		metalness: 0.7,
	});
	const lens = new Mesh(new CylinderGeometry(0.07, 0.08, 0.1, 16), lensMat);
	lens.rotation.x = Math.PI / 2;
	lens.position.set(0, 0.14, 0.16);
	g.add(lens);

	const glassMat = new MeshStandardMaterial({
		color: new Color("#4a7aaa"),
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
		new MeshStandardMaterial({ color: new Color("#e8e0d4"), roughness: 0.3, metalness: 0.2 }),
	);
	flash.position.set(0.09, 0.3, 0);
	g.add(flash);

	const viewfinder = new Mesh(new SphereGeometry(0.025, 8, 8), bodyMat);
	viewfinder.position.set(-0.1, 0.3, 0);
	g.add(viewfinder);

	// Small decorative film roll next to camera
	const rollMat = new MeshStandardMaterial({ color: new Color("#333333"), roughness: 0.5 });
	const roll = new Mesh(new CylinderGeometry(0.06, 0.06, 0.12, 12), rollMat);
	roll.position.set(0.35, 0.06, 0.05);
	roll.rotation.z = Math.PI / 2;
	g.add(roll);

	g.rotation.y = 0.15;
	return g;
}

function createShelfShell(): Group {
	const shell = new Group();

	const wallMaterial = new MeshStandardMaterial({
		color: new Color("#2b2620"),
		roughness: 1.0,
		metalness: 0.0,
		transparent: true,
		opacity: 0.2,
		depthWrite: false,
		side: DoubleSide,
	});
	const returnMaterial = new MeshStandardMaterial({
		color: new Color("#211d19"),
		roughness: 1.0,
		metalness: 0.0,
		transparent: true,
		opacity: 0.1,
		depthWrite: false,
		side: DoubleSide,
	});
	const floorMaterial = new MeshStandardMaterial({
		color: new Color("#23211f"),
		roughness: 0.98,
		metalness: 0.0,
		transparent: true,
		opacity: 0.92,
		depthWrite: false,
	});

	const wallPlane = new Mesh(new PlaneGeometry(BLEND_WALL_W, BLEND_WALL_H), wallMaterial);
	wallPlane.position.set(WALL_X + 0.04, FLOOR_Y + BLEND_WALL_H / 2, WALL_Z);
	wallPlane.rotation.y = -Math.PI / 2;
	shell.add(wallPlane);

	const returnWall = new Mesh(new PlaneGeometry(RETURN_W, BLEND_WALL_H), returnMaterial);
	returnWall.position.set(
		WALL_X - RETURN_W / 2 + 0.08,
		FLOOR_Y + BLEND_WALL_H / 2,
		WALL_Z - WALL_W / 2 - 1.4,
	);
	shell.add(returnWall);

	const floor = new Mesh(new PlaneGeometry(FLOOR_W, FLOOR_D), floorMaterial);
	floor.rotation.x = -Math.PI / 2;
	floor.position.set(WALL_X - FLOOR_W / 2 + 1.1, FLOOR_Y, WALL_Z);
	floor.receiveShadow = true;
	shell.add(floor);

	const wallShadow = new Mesh(
		new PlaneGeometry(WALL_W + 1.8, WALL_H + 0.6),
		new MeshStandardMaterial({
			color: new Color("#171412"),
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
export function createShelfWall(books?: BookData[]): ShelfWallResult {
	const wall = new Group();
	wall.userData = { shelfWall: true };

	// Blended room shell for the side wall and floor.
	wall.add(createShelfShell());

	// Create shelf planks
	const shelves = createShelfPlank(TOP_Y);
	shelves.position.set(SHELF_CENTER_X, 0, WALL_Z);
	wall.add(shelves);

	const midShelves = createShelfPlank(MID_Y);
	midShelves.position.set(SHELF_CENTER_X, 0, WALL_Z);
	wall.add(midShelves);

	const botShelves = createShelfPlank(BOT_Y);
	botShelves.position.set(SHELF_CENTER_X, 0, WALL_Z);
	wall.add(botShelves);

	const tapTargets: Group[] = [];
	const shelfItems: Group[] = [];

	// ─── Top shelf: Books (Reading) ───────────────────────────────
	const topGroup = new Group();
	topGroup.userData = { interactive: true, href: "/reading", label: "Reading" };
	const topBooks = createShelfBooks(books);
	topBooks.position.set(SHELF_CENTER_X - 0.04, TOP_Y + SHELF_THICK / 2, WALL_Z);
	topBooks.rotation.y = -Math.PI / 2;
	topGroup.add(topBooks);
	addHitbox(topGroup, 0.1);
	wall.add(topGroup);
	tapTargets.push(topGroup);
	shelfItems.push(topBooks);

	// ─── Middle shelf LEFT: Notebook (Blog) ───────────────────────
	const midLeftGroup = new Group();
	midLeftGroup.userData = { interactive: true, href: "/blog", label: "Blog" };
	const notebook = createShelfNotebook();
	notebook.position.set(SHELF_CENTER_X - 0.08, MID_Y + SHELF_THICK / 2 + 0.28, WALL_Z - 0.54);
	notebook.rotation.y = -Math.PI / 2;
	midLeftGroup.add(notebook);
	addHitbox(midLeftGroup, 0.1);
	wall.add(midLeftGroup);
	tapTargets.push(midLeftGroup);
	shelfItems.push(notebook);

	// ─── Middle shelf RIGHT: Laptop (Projects) ───────────────────
	const midRightGroup = new Group();
	midRightGroup.userData = { interactive: true, href: "/projects", label: "Projects" };
	const laptop = createShelfLaptop();
	laptop.position.set(SHELF_CENTER_X - 0.14, MID_Y + SHELF_THICK / 2 + 0.025, WALL_Z + 0.62);
	laptop.rotation.y = -Math.PI / 2;
	midRightGroup.add(laptop);
	addHitbox(midRightGroup, 0.1);
	wall.add(midRightGroup);
	tapTargets.push(midRightGroup);
	shelfItems.push(laptop);

	// ─── Bottom shelf: Camera (Photos) ────────────────────────────
	const botGroup = new Group();
	botGroup.userData = { interactive: true, href: "/photos", label: "Photos" };
	const camera = createShelfCamera();
	camera.position.set(SHELF_CENTER_X - 0.02, BOT_Y + SHELF_THICK / 2, WALL_Z);
	camera.rotation.y = -Math.PI / 2;
	botGroup.add(camera);
	addHitbox(botGroup, 0.1);
	wall.add(botGroup);
	tapTargets.push(botGroup);
	shelfItems.push(camera);

	return { wall, tapTargets, shelfItems };
}
