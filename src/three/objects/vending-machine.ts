import {
	BoxGeometry,
	Color,
	CylinderGeometry,
	Group,
	Mesh,
	MeshStandardMaterial,
	SphereGeometry,
	TorusGeometry,
} from "three";
import {
	accentMaterial,
	brushedMetalMaterial,
	createBookMaterial,
	metalMaterial,
	paperMaterial,
	screenMaterial,
} from "../materials";

export interface BookData {
	title: string;
	spineColor: string;
}

const W = 2.4;
const D = 0.9;
const WALL = 0.06;
const COMP_H = 0.95;
const COMP_GAP = 0.04;
const SHELF_Y_START = 2.4;

const interiorMat = new MeshStandardMaterial({
	color: new Color("#3d3d42"),
	roughness: 0.8,
	metalness: 0.2,
});
const shelfEdgeMat = new MeshStandardMaterial({
	color: new Color("#555560"),
	roughness: 0.5,
	metalness: 0.6,
});
const shelfTop = -COMP_H / 2 + 0.03;

export interface VendingResult {
	machine: Group;
	compartments: Group[];
	items: Group[];
}

// ─── Vending items — all built fresh, no cloning ────────────────

function createVendingNotebook(): Group {
	const g = new Group();
	g.userData = { vendingItem: true };

	// Standing upright notebook leaning against the back wall
	// Cover (front face visible to camera)
	const coverMat = new MeshStandardMaterial({ color: new Color("#9a3230"), roughness: 0.6 });
	const cover = new Mesh(new BoxGeometry(0.5, 0.65, 0.03), coverMat);
	g.add(cover);

	// Pages (visible as thickness on the side)
	const pages = new Mesh(new BoxGeometry(0.46, 0.62, 0.05), paperMaterial);
	pages.position.z = -0.02;
	g.add(pages);

	// Back cover
	const backCover = new Mesh(new BoxGeometry(0.5, 0.65, 0.02), accentMaterial);
	backCover.position.z = -0.045;
	g.add(backCover);

	// Spiral rings along the top edge
	const ringMat = new MeshStandardMaterial({
		color: new Color("#c0c0c0"),
		roughness: 0.3,
		metalness: 0.8,
	});
	const ringGeo = new TorusGeometry(0.025, 0.005, 6, 10);
	for (let i = 0; i < 6; i++) {
		const ring = new Mesh(ringGeo, ringMat);
		ring.position.set(-0.2 + i * 0.08, 0.33, -0.01);
		g.add(ring);
	}

	// Lean back slightly
	g.rotation.x = -0.15;
	// Position: standing on shelf, bottom at shelf surface
	g.position.set(0, shelfTop + 0.33, -0.1);
	return g;
}

function createVendingLaptop(): Group {
	const g = new Group();
	g.userData = { vendingItem: true };

	// Base
	const base = new Mesh(new BoxGeometry(0.7, 0.03, 0.45), metalMaterial);
	g.add(base);

	// Keyboard area
	const kbMat = new MeshStandardMaterial({ color: new Color("#2a2a2a"), roughness: 0.6 });
	const kb = new Mesh(new BoxGeometry(0.58, 0.005, 0.28), kbMat);
	kb.position.set(0, 0.018, 0.03);
	g.add(kb);

	// Screen
	const screenGroup = new Group();
	const screenBack = new Mesh(new BoxGeometry(0.68, 0.45, 0.02), metalMaterial);
	screenGroup.add(screenBack);
	const faceMat = new MeshStandardMaterial({
		color: new Color("#2a5a8a"),
		emissive: new Color("#3a6a9a"),
		emissiveIntensity: 2.0,
		roughness: 0.1,
	});
	const face = new Mesh(new BoxGeometry(0.6, 0.38, 0.005), faceMat);
	face.position.z = 0.013;
	screenGroup.add(face);

	// Code lines on screen
	const lineMat = new MeshStandardMaterial({
		color: new Color("#88ccff"),
		emissive: new Color("#88ccff"),
		emissiveIntensity: 1.5,
	});
	for (let i = 0; i < 4; i++) {
		const lineW = 0.18 + Math.sin(i * 2.3) * 0.08;
		const line = new Mesh(new BoxGeometry(lineW, 0.012, 0.002), lineMat);
		line.position.set(-0.08 + (i % 2) * 0.04, 0.09 - i * 0.06, 0.016);
		screenGroup.add(line);
	}

	screenGroup.position.set(0, 0.25, -0.21);
	screenGroup.rotation.x = -0.2;
	g.add(screenGroup);

	// Position: sitting flat on shelf
	g.position.set(0, shelfTop + 0.015, 0.05);
	return g;
}

function createVendingBookStack(books?: BookData[]): Group {
	const defaults: BookData[] = [
		{ title: "Design", spineColor: "#2a4a6a" },
		{ title: "Code", spineColor: "#6a3a3a" },
		{ title: "Ideas", spineColor: "#3a5a3a" },
	];
	const data = books && books.length > 0 ? books.slice(0, 3) : defaults;
	const g = new Group();
	g.userData = { vendingItem: true };

	const bookH = 0.08;
	const bookD = 0.45;
	let y = 0;
	for (let i = 0; i < data.length; i++) {
		const { spineColor } = data[i];
		const w = 0.55 + i * 0.05;
		const book = new Mesh(new BoxGeometry(w, bookH, bookD), createBookMaterial(spineColor));
		book.position.set((i % 2 === 0 ? 1 : -1) * 0.02, y + bookH / 2, 0);
		g.add(book);

		// Spine label strip
		const labelColor = new Color(spineColor).offsetHSL(0, -0.15, 0.25);
		const label = new Mesh(
			new BoxGeometry(w * 0.6, bookH * 0.4, 0.005),
			new MeshStandardMaterial({ color: labelColor, roughness: 0.6 }),
		);
		label.position.set(book.position.x, book.position.y, bookD / 2 + 0.003);
		g.add(label);

		y += bookH + 0.005;
	}

	// Position: sitting on shelf
	g.position.set(0, shelfTop, 0.05);
	return g;
}

function createVendingCamera(): Group {
	const g = new Group();
	g.userData = { vendingItem: true };

	const bodyMat = new MeshStandardMaterial({
		color: new Color("#1a1a1a"),
		roughness: 0.4,
		metalness: 0.6,
	});
	const body = new Mesh(new BoxGeometry(0.5, 0.3, 0.25), bodyMat);
	body.position.y = 0.15;
	g.add(body);

	const lensMat = new MeshStandardMaterial({
		color: new Color("#2a2a2a"),
		roughness: 0.3,
		metalness: 0.7,
	});
	const lens = new Mesh(new CylinderGeometry(0.08, 0.09, 0.12, 16), lensMat);
	lens.rotation.x = Math.PI / 2;
	lens.position.set(0, 0.15, 0.18);
	g.add(lens);

	const glassMat = new MeshStandardMaterial({
		color: new Color("#4a7aaa"),
		roughness: 0.05,
		metalness: 0.3,
		transparent: true,
		opacity: 0.7,
	});
	const glass = new Mesh(new CylinderGeometry(0.065, 0.065, 0.015, 16), glassMat);
	glass.rotation.x = Math.PI / 2;
	glass.position.set(0, 0.15, 0.245);
	g.add(glass);

	const flash = new Mesh(
		new BoxGeometry(0.12, 0.06, 0.08),
		new MeshStandardMaterial({ color: new Color("#e8e0d4"), roughness: 0.3, metalness: 0.2 }),
	);
	flash.position.set(0.1, 0.33, 0);
	g.add(flash);

	const viewfinder = new Mesh(new SphereGeometry(0.03, 8, 8), bodyMat);
	viewfinder.position.set(-0.12, 0.32, 0);
	g.add(viewfinder);

	g.rotation.y = 0.2;
	g.position.set(0, shelfTop, 0.05);
	return g;
}

// ─── Build the machine ──────────────────────────────────────────
export function createVendingMachine(
	sections: { label: string; href: string }[],
	books?: BookData[],
): VendingResult {
	const machine = new Group();

	const topY = SHELF_Y_START + COMP_H / 2;
	const bottomCompY = SHELF_Y_START - (sections.length - 1) * (COMP_H + COMP_GAP) - COMP_H / 2;
	const headerH = 0.45;
	const slotH = 0.55;
	const bodyTop = topY + headerH;
	const bodyBottom = bottomCompY - slotH - 0.15;
	const bodyH = bodyTop - bodyBottom;
	const bodyCenterY = (bodyTop + bodyBottom) / 2;

	// Body panels
	const back = new Mesh(new BoxGeometry(W, bodyH, WALL), brushedMetalMaterial);
	back.position.set(0, bodyCenterY, -D / 2);
	machine.add(back);

	const left = new Mesh(new BoxGeometry(WALL, bodyH, D), brushedMetalMaterial);
	left.position.set(-W / 2, bodyCenterY, 0);
	machine.add(left);

	const right = new Mesh(new BoxGeometry(WALL, bodyH, D), brushedMetalMaterial);
	right.position.set(W / 2, bodyCenterY, 0);
	machine.add(right);

	const topPanel = new Mesh(new BoxGeometry(W + 0.08, WALL * 2, D + 0.08), brushedMetalMaterial);
	topPanel.position.set(0, bodyTop, 0);
	machine.add(topPanel);

	const bottomPanel = new Mesh(new BoxGeometry(W + 0.08, WALL * 2, D + 0.08), brushedMetalMaterial);
	bottomPanel.position.set(0, bodyBottom, 0);
	machine.add(bottomPanel);

	const interior = new Mesh(new BoxGeometry(W - WALL * 2, bodyH - WALL * 2, 0.01), interiorMat);
	interior.position.set(0, bodyCenterY, -D / 2 + WALL + 0.01);
	machine.add(interior);

	// Glass front
	const totalCompH = sections.length * COMP_H + (sections.length - 1) * COMP_GAP;
	const glassH = totalCompH + COMP_GAP * 2;
	const glassCenterY = SHELF_Y_START - ((sections.length - 1) * (COMP_H + COMP_GAP)) / 2;
	const glassVisualMat = new MeshStandardMaterial({
		color: new Color("#c8dce8"),
		roughness: 0.05,
		metalness: 0.1,
		transparent: true,
		opacity: 0.2,
	});
	const glass = new Mesh(new BoxGeometry(W - WALL * 2 - 0.02, glassH, 0.015), glassVisualMat);
	glass.position.set(0, glassCenterY, D / 2 - 0.01);
	machine.add(glass);

	// Display screen
	const display = new Mesh(new BoxGeometry(W * 0.6, 0.2, 0.02), screenMaterial);
	display.position.set(0, topY + headerH / 2, D / 2 - 0.005);
	machine.add(display);

	// Brand accent strip
	const brandStrip = new Mesh(new BoxGeometry(W - WALL * 4, 0.04, 0.02), accentMaterial);
	brandStrip.position.set(0, topY + 0.05, D / 2 - 0.005);
	machine.add(brandStrip);

	// Pickup slot
	const slotY = bottomCompY - slotH / 2 - 0.08;
	const slotBack = new Mesh(
		new BoxGeometry(W - WALL * 4, slotH, D * 0.7),
		new MeshStandardMaterial({ color: new Color("#151515"), roughness: 0.95 }),
	);
	slotBack.position.set(0, slotY, -0.05);
	machine.add(slotBack);

	const slotLip = new Mesh(new BoxGeometry(W - WALL * 3, WALL * 2, D * 0.4), brushedMetalMaterial);
	slotLip.position.set(0, slotY + slotH / 2, D / 2 - D * 0.2);
	machine.add(slotLip);

	// ─── Compartments ───────────────────────────────────────────
	const itemBuilders: Record<string, () => Group> = {
		Blog: createVendingNotebook,
		Projects: createVendingLaptop,
		Reading: () => createVendingBookStack(books),
		Photos: createVendingCamera,
	};

	const compartments: Group[] = [];
	const items: Group[] = [];

	for (let i = 0; i < sections.length; i++) {
		const { label, href } = sections[i];
		const compY = SHELF_Y_START - i * (COMP_H + COMP_GAP);

		const comp = new Group();
		comp.userData = { interactive: true, href, label };
		comp.position.set(0, compY, 0);

		// Shelf
		const shelf = new Mesh(new BoxGeometry(W - WALL * 2, 0.03, D - WALL * 2), shelfEdgeMat);
		shelf.position.set(0, -COMP_H / 2, 0);
		comp.add(shelf);

		// Front lip
		const lip = new Mesh(new BoxGeometry(W - WALL * 2, 0.03, 0.03), shelfEdgeMat);
		lip.position.set(0, -COMP_H / 2, D / 2 - 0.03);
		comp.add(lip);

		// Accent strip
		const strip = new Mesh(new BoxGeometry(0.035, COMP_H * 0.5, 0.015), accentMaterial);
		strip.position.set(-W / 2 + WALL + 0.04, 0, D / 2 - 0.015);
		comp.add(strip);

		// Item — built fresh, no cloning
		const builder = itemBuilders[label] ?? createVendingCamera;
		const item = builder();
		comp.add(item);
		items.push(item);

		machine.add(comp);
		compartments.push(comp);
	}

	machine.position.y = 1.0;

	return { machine, compartments, items };
}
