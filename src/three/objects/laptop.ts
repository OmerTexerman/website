import {
	BoxGeometry,
	Color,
	CylinderGeometry,
	Group,
	Mesh,
	MeshStandardMaterial,
	SpotLight,
} from "three";
import {
	ALMOST_BLACK,
	KEYCAP,
	LAPTOP_SCREEN_GLOW,
	MEDIUM_GRAY,
	METAL,
	VERY_DARK_GRAY,
} from "../colors";
import { applySectionInteraction } from "../interactive-section";
import { screenMaterial } from "../materials";

export interface LaptopObject {
	root: Group;
	parts: {
		screenGroup: Group;
		screenFace: Mesh;
		screenLight: SpotLight;
	};
}

/** Laptop → links to /projects */
export function createLaptop(): LaptopObject {
	const laptop = new Group();
	applySectionInteraction(laptop, "projects");

	// Base — matte aluminium so it doesn't mirror the screen light
	const baseMat = new MeshStandardMaterial({
		color: new Color(METAL),
		roughness: 0.7,
		metalness: 0.3,
	});
	const baseGeo = new BoxGeometry(1.2, 0.05, 0.8);
	const base = new Mesh(baseGeo, baseMat);
	base.position.set(0, 0.025, 0);
	base.castShadow = true;
	laptop.add(base);

	const hinge = new Mesh(
		new CylinderGeometry(0.026, 0.026, 1.02, 24),
		new MeshStandardMaterial({
			color: new Color(VERY_DARK_GRAY),
			roughness: 0.62,
			metalness: 0.3,
		}),
	);
	hinge.rotation.z = Math.PI / 2;
	hinge.position.set(0, 0.058, -0.37);
	hinge.castShadow = true;
	laptop.add(hinge);

	// Matte throughout: keycaps and the well around them are dull plastic,
	// and anything glossy here catches the screen's light and looks wet.
	const wellMat = new MeshStandardMaterial({
		color: new Color(ALMOST_BLACK),
		roughness: 0.95,
		metalness: 0,
	});
	const keyMat = new MeshStandardMaterial({
		color: new Color(KEYCAP),
		roughness: 0.9,
		metalness: 0,
	});

	// Keyboard well
	const kbSurface = new Mesh(new BoxGeometry(1.0, 0.005, 0.42), wellMat);
	kbSurface.position.set(0, 0.053, -0.02);
	laptop.add(kbSurface);

	// Keys: four full rows, then a bottom row with a wide spacebar so the
	// layout reads as a keyboard rather than a grid.
	const KEY = 0.062;
	const PITCH = 0.074;
	const KEY_H = 0.01;
	const COLS = 13;
	const rowWidth = COLS * PITCH - (PITCH - KEY);
	const left = -rowWidth / 2;
	const keyZ = (row: number) => -0.17 + row * 0.072;
	const addKey = (x: number, width: number, row: number) => {
		const key = new Mesh(new BoxGeometry(width, KEY_H, KEY * 0.85), keyMat);
		key.position.set(x + width / 2, 0.058, keyZ(row));
		laptop.add(key);
	};
	for (let row = 0; row < 4; row++) {
		for (let col = 0; col < COLS; col++) addKey(left + col * PITCH, KEY, row);
	}
	// Bottom row: three keys, spacebar, three keys.
	const sideKeys = 3;
	for (let i = 0; i < sideKeys; i++) {
		addKey(left + i * PITCH, KEY, 4);
		addKey(left + rowWidth - KEY - i * PITCH, KEY, 4);
	}
	const spaceLeft = left + sideKeys * PITCH;
	addKey(spaceLeft, rowWidth - 2 * sideKeys * PITCH - (PITCH - KEY), 4);

	// Trackpad: wide and flush, a shade darker than the aluminium
	const trackpadMat = new MeshStandardMaterial({
		color: new Color(MEDIUM_GRAY),
		roughness: 0.85,
		metalness: 0.1,
	});
	const trackpad = new Mesh(new BoxGeometry(0.42, 0.003, 0.17), trackpadMat);
	trackpad.position.set(0, 0.0515, 0.29);
	laptop.add(trackpad);

	// Screen (angled) — pivot at hinge (top-back edge of base)
	const screenGroup = new Group();
	const screenGeo = new BoxGeometry(1.18, 0.75, 0.03);
	const screenShellMaterial = new MeshStandardMaterial({
		color: new Color(ALMOST_BLACK),
		roughness: 0.58,
		metalness: 0.25,
	});
	const screen = new Mesh(screenGeo, screenShellMaterial);
	screen.position.set(0, 0.375, 0.015); // offset so bottom edge sits at pivot
	screen.castShadow = true;
	screenGroup.add(screen);

	const topBezelHeight = 0.026;
	const bottomBezelHeight = 0.036;
	const sideBezelWidth = 0.03;
	const bezelGeoTop = new BoxGeometry(1.12, topBezelHeight, 0.006);
	const bezelGeoBottom = new BoxGeometry(1.12, bottomBezelHeight, 0.006);
	const bezelGeoVertical = new BoxGeometry(sideBezelWidth, 0.646, 0.006);
	const bezelZ = 0.031;
	const bezelMat = wellMat;
	const topBezel = new Mesh(bezelGeoTop, bezelMat);
	topBezel.position.set(0, 0.737, bezelZ);
	screenGroup.add(topBezel);

	const bottomBezel = new Mesh(bezelGeoBottom, bezelMat);
	bottomBezel.position.set(0, 0.025, bezelZ);
	screenGroup.add(bottomBezel);

	const leftBezel = new Mesh(bezelGeoVertical, bezelMat);
	leftBezel.position.set(-0.545, 0.381, bezelZ);
	screenGroup.add(leftBezel);

	const rightBezel = new Mesh(bezelGeoVertical, bezelMat);
	rightBezel.position.set(0.545, 0.381, bezelZ);
	screenGroup.add(rightBezel);

	// Screen face
	const faceGeo = new BoxGeometry(1.05, 0.645, 0.005);
	const face = new Mesh(faceGeo, screenMaterial);
	face.position.set(0, 0.381, 0.029); // inset slightly behind the bezel frame
	screenGroup.add(face);

	screenGroup.position.set(0, 0.058, -0.38); // hinge point: top-back of base
	screenGroup.rotation.x = 0.4; // ~113° open: a natural working angle that still reads from above
	laptop.add(screenGroup);

	const screenLight = new SpotLight(new Color(LAPTOP_SCREEN_GLOW), 2.0, 12, Math.PI / 2, 1.0, 1.0);
	screenLight.position.set(0, 0.4, 0.1);
	screenLight.target.position.set(0, -1.0, 4.0);
	screenGroup.add(screenLight);
	screenGroup.add(screenLight.target);

	laptop.position.set(0.5, 0.12, -0.3);
	laptop.rotation.y = -0.12;

	return {
		root: laptop,
		parts: {
			screenGroup,
			screenFace: face,
			screenLight,
		},
	};
}
