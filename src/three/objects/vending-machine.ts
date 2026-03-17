import { BoxGeometry, Color, type Group, Mesh, MeshStandardMaterial, type Object3D } from "three";
import { accentMaterial, brushedMetalMaterial, metalMaterial, screenMaterial } from "../materials";
import { createBookStack } from "./book-stack";
import { createLaptop } from "./laptop";
import { createNotebook } from "./notebook";
import { createPhotoFrame } from "./photo-frame";

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

export interface VendingResult {
	machine: Group;
	compartments: Group[];
	items: Group[];
}

/**
 * Measure the bounding height of a group's children (approximate).
 * Used to position items so they sit on the shelf.
 */
function measureHeight(obj: Object3D): number {
	let minY = Infinity;
	let maxY = -Infinity;
	obj.traverse((child) => {
		if (child instanceof Mesh) {
			child.geometry.computeBoundingBox();
			const bb = child.geometry.boundingBox;
			if (!bb) return;
			const worldY = child.position.y;
			minY = Math.min(minY, worldY + bb.min.y);
			maxY = Math.max(maxY, worldY + bb.max.y);
		}
	});
	if (minY === Infinity) return 0;
	return maxY - minY;
}

function measureMinY(obj: Object3D): number {
	let minY = Infinity;
	obj.traverse((child) => {
		if (child instanceof Mesh) {
			child.geometry.computeBoundingBox();
			const bb = child.geometry.boundingBox;
			if (!bb) return;
			minY = Math.min(minY, child.position.y + bb.min.y);
		}
	});
	return minY === Infinity ? 0 : minY;
}

/**
 * Clone and prepare a desk object for the vending machine:
 * - Strip desk-specific userData (position, interactive, href, etc.)
 * - Reset position/rotation
 * - Scale to fit compartment
 */
function prepareForVending(original: Group): Group {
	// Create fresh copy using the same constructor
	const clone = original.clone();

	// Clear desk-specific userData
	clone.userData = { vendingItem: true };
	clone.position.set(0, 0, 0);
	clone.rotation.set(0, 0, 0);

	// Scale to fit compartment (target max height ~0.5 units)
	const height = measureHeight(clone);
	const targetHeight = COMP_H * 0.55;
	if (height > 0) {
		const scale = targetHeight / height;
		clone.scale.setScalar(Math.min(scale, 1.5)); // don't upscale too much
	}

	// Position so bottom sits on shelf
	const minY = measureMinY(clone) * clone.scale.y;
	const shelfTop = -COMP_H / 2 + 0.02;
	clone.position.y = shelfTop - minY;
	clone.position.z = 0.05;

	return clone;
}

// ─── Build the machine ──────────────────────────────────────────
export function createVendingMachine(sections: { label: string; href: string }[]): VendingResult {
	const machine = new (await_group())();

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

	// Interior
	const interior = new Mesh(new BoxGeometry(W - WALL * 2, bodyH - WALL * 2, 0.01), interiorMat);
	interior.position.set(0, bodyCenterY, -D / 2 + WALL + 0.01);
	machine.add(interior);

	// Glass front
	const totalCompH = sections.length * COMP_H + (sections.length - 1) * COMP_GAP;
	const glassH = totalCompH + COMP_GAP * 2;
	const glassCenterY = SHELF_Y_START - ((sections.length - 1) * (COMP_H + COMP_GAP)) / 2;
	const glassMat = new MeshStandardMaterial({
		color: new Color("#c8dce8"),
		roughness: 0.05,
		metalness: 0.1,
		transparent: true,
		opacity: 0.2,
	});
	const glass = new Mesh(new BoxGeometry(W - WALL * 2 - 0.02, glassH, 0.015), glassMat);
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
	const slotInterior = new MeshStandardMaterial({ color: new Color("#151515"), roughness: 0.95 });
	const slotBack = new Mesh(new BoxGeometry(W - WALL * 4, slotH, D * 0.7), slotInterior);
	slotBack.position.set(0, slotY, -0.05);
	machine.add(slotBack);

	const slotLip = new Mesh(new BoxGeometry(W - WALL * 3, WALL * 2, D * 0.4), brushedMetalMaterial);
	slotLip.position.set(0, slotY + slotH / 2, D / 2 - D * 0.2);
	machine.add(slotLip);

	// Create desk objects and reuse them
	const sourceObjects = [createNotebook(), createLaptop(), createBookStack(), createPhotoFrame()];

	// Compartments
	const compartments: Group[] = [];
	const items: Group[] = [];

	for (let i = 0; i < sections.length; i++) {
		const { label, href } = sections[i];
		const compY = SHELF_Y_START - i * (COMP_H + COMP_GAP);

		const comp = new (await_group())();
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

		// Reuse the desk object
		const item = prepareForVending(sourceObjects[i % sourceObjects.length]);
		comp.add(item);
		items.push(item);

		machine.add(comp);
		compartments.push(comp);
	}

	machine.position.y = 1.0;

	return { machine, compartments, items };
}
