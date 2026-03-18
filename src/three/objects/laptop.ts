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
	DARK_GRAY,
	LAPTOP_SCREEN_GLOW,
	MEDIUM_GRAY,
	METAL,
	VERY_DARK_GRAY,
} from "../colors";
import { applySectionInteraction } from "../interactive-section";
import { darkMetalMaterial, screenMaterial } from "../materials";

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

	// Keyboard area (dark inset surface)
	const kbSurface = new Mesh(new BoxGeometry(1.0, 0.005, 0.42), darkMetalMaterial);
	kbSurface.position.set(0, 0.053, -0.02);
	laptop.add(kbSurface);

	// Key rows — 5 rows of small keys
	const keyMat = new MeshStandardMaterial({
		color: new Color(DARK_GRAY),
		roughness: 0.6,
		metalness: 0.4,
	});
	const keyWidth = 0.065;
	const keyDepth = 0.05;
	const keyHeight = 0.01;
	const keyGeo = new BoxGeometry(keyWidth, keyHeight, keyDepth);
	const gapX = 0.075;
	const gapZ = 0.065;
	const cols = 12;
	const rows = 5;
	const startX = -((cols - 1) * gapX) / 2;
	const startZ = -0.16;

	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < cols; col++) {
			const key = new Mesh(keyGeo, keyMat);
			key.position.set(startX + col * gapX, 0.058, startZ + row * gapZ);
			laptop.add(key);
		}
	}

	// Trackpad
	const trackpadMat = new MeshStandardMaterial({
		color: new Color(MEDIUM_GRAY),
		roughness: 0.8,
		metalness: 0.1,
	});
	const trackpad = new Mesh(new BoxGeometry(0.3, 0.005, 0.2), trackpadMat);
	trackpad.position.set(0, 0.054, 0.25);
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
	const topBezel = new Mesh(bezelGeoTop, darkMetalMaterial);
	topBezel.position.set(0, 0.737, bezelZ);
	screenGroup.add(topBezel);

	const bottomBezel = new Mesh(bezelGeoBottom, darkMetalMaterial);
	bottomBezel.position.set(0, 0.025, bezelZ);
	screenGroup.add(bottomBezel);

	const leftBezel = new Mesh(bezelGeoVertical, darkMetalMaterial);
	leftBezel.position.set(-0.545, 0.381, bezelZ);
	screenGroup.add(leftBezel);

	const rightBezel = new Mesh(bezelGeoVertical, darkMetalMaterial);
	rightBezel.position.set(0.545, 0.381, bezelZ);
	screenGroup.add(rightBezel);

	// Screen face
	const faceGeo = new BoxGeometry(1.05, 0.645, 0.005);
	const face = new Mesh(faceGeo, screenMaterial);
	face.position.set(0, 0.381, 0.029); // inset slightly behind the bezel frame
	screenGroup.add(face);

	screenGroup.position.set(0, 0.058, -0.38); // hinge point: top-back of base
	screenGroup.rotation.x = 0.78; // more closed so the lid silhouette reads immediately
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
