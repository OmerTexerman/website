import {
	BoxGeometry,
	CanvasTexture,
	Color,
	DoubleSide,
	Group,
	Mesh,
	MeshStandardMaterial,
	PlaneGeometry,
	type Texture,
	TextureLoader,
} from "three";
import type { SpotlightInfo } from "../../content/types";
import { ACCENT, CREAM, DARK_WOOD } from "../colors";

export interface SpotlightFrameObject {
	root: Group;
	parts: {
		frame: Group;
		imagePlane: Mesh;
	};
}

const FRAME_W = 0.42;
const FRAME_H = 0.5;
const FRAME_DEPTH = 0.025;
const BORDER = 0.03;
const IMAGE_W = FRAME_W - BORDER * 2;
const IMAGE_H = FRAME_H - BORDER * 2 - 0.07; // leave room for nameplate area
const STAND_H = 0.28;

const frameMaterial = new MeshStandardMaterial({
	color: new Color(DARK_WOOD),
	roughness: 0.8,
	metalness: 0.05,
});

const sharedLoader = new TextureLoader();
const loadedTextures = new Set<Texture>();

/** Dispose all textures loaded by the spotlight frame image loader. */
export function disposeSpotlightTextures(): void {
	for (const tex of loadedTextures) {
		tex.dispose();
	}
	loadedTextures.clear();
}

function createNameplateTexture(title: string, name?: string): CanvasTexture {
	const canvas = document.createElement("canvas");
	canvas.width = 512;
	canvas.height = 128;
	const ctx = canvas.getContext("2d");
	if (!ctx) return new CanvasTexture(canvas);

	ctx.fillStyle = DARK_WOOD;
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	ctx.fillStyle = CREAM;
	ctx.globalAlpha = 0.9;
	ctx.font = "bold 36px 'Space Grotesk', sans-serif";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";

	const displayText = name ? `${title} — ${name}` : title;
	let text = displayText;
	while (ctx.measureText(text).width > canvas.width - 40 && text.length > 3) {
		text = `${text.slice(0, -4)}...`;
	}

	ctx.fillText(text, canvas.width / 2, canvas.height / 2);

	return new CanvasTexture(canvas);
}

/** Create an image plane with the accent color fallback, loading the spotlight image if available. */
function createImagePlane(w: number, h: number, imageUrl?: string): Mesh {
	const mat = new MeshStandardMaterial({
		color: new Color(ACCENT),
		roughness: 0.5,
		metalness: 0.0,
	});
	const plane = new Mesh(new PlaneGeometry(w, h), mat);

	if (imageUrl) {
		sharedLoader.load(
			imageUrl,
			(texture) => {
				loadedTextures.add(texture);
				mat.map = texture;
				mat.color.set(0xffffff);
				mat.needsUpdate = true;
			},
			undefined,
			(error) => {
				console.warn("Failed to load spotlight image:", imageUrl, error);
			},
		);
	}

	return plane;
}

/** Create a nameplate mesh for the given spotlight data. */
function createNameplate(width: number, height: number, spotlight?: SpotlightInfo | null): Mesh {
	const tex = createNameplateTexture(spotlight?.title ?? "Employee of the Week", spotlight?.name);
	return new Mesh(
		new PlaneGeometry(width, height),
		new MeshStandardMaterial({
			map: tex,
			roughness: 0.5,
			metalness: 0.3,
		}),
	);
}

export function createSpotlightFrame(spotlight?: SpotlightInfo | null): SpotlightFrameObject {
	const root = new Group();

	const frame = new Group();

	// Frame body — single solid box that acts as both backing and border
	const frameBody = new Mesh(new BoxGeometry(FRAME_W, FRAME_H, FRAME_DEPTH), frameMaterial);
	frame.add(frameBody);

	const imagePlane = createImagePlane(IMAGE_W, IMAGE_H, spotlight?.image);
	imagePlane.position.set(0, 0.02, FRAME_DEPTH / 2 + 0.001);
	frame.add(imagePlane);

	const nameplate = createNameplate(IMAGE_W * 0.85, 0.04, spotlight);
	nameplate.position.set(0, -(FRAME_H / 2 - BORDER - 0.025), FRAME_DEPTH / 2 + 0.002);
	frame.add(nameplate);

	// Stand (back leg)
	const standMat = new MeshStandardMaterial({
		color: new Color(DARK_WOOD),
		roughness: 0.85,
		metalness: 0.0,
	});
	const stand = new Mesh(new BoxGeometry(0.015, STAND_H, 0.008), standMat);
	stand.position.set(0, -(FRAME_H / 2 - STAND_H / 2 + 0.02), -(FRAME_DEPTH + 0.04));
	stand.rotation.x = 0.25;
	frame.add(stand);

	// Position frame upright on desk
	frame.position.set(0, FRAME_H / 2 + 0.01, 0);
	root.add(frame);

	root.userData = { interactive: true };

	// Position just behind the notebook, leaning back, angled toward camera
	root.position.set(-1.6, 0.12, -0.55);
	root.rotation.set(-0.8, 0.35, 0.2);

	return { root, parts: { frame, imagePlane } };
}

/** Create a wall-mounted version for the shelf scene. */
export function createShelfSpotlightFrame(spotlight?: SpotlightInfo | null): Group {
	const g = new Group();

	const WALL_FRAME_W = 0.3;
	const WALL_FRAME_H = 0.36;
	const WF_BORDER = 0.02;
	const WF_DEPTH = 0.015;
	const WF_IMAGE_W = WALL_FRAME_W - WF_BORDER * 2;
	const WF_IMAGE_H = WALL_FRAME_H - WF_BORDER * 2 - 0.05;

	// Backing — use dark wood like the desk version so the visible margin
	// around the image blends with the frame border.
	const backing = new Mesh(new BoxGeometry(WALL_FRAME_W, WALL_FRAME_H, WF_DEPTH), frameMaterial);
	g.add(backing);

	// Frame border
	const borderMat = new MeshStandardMaterial({
		color: new Color(DARK_WOOD),
		roughness: 0.8,
		metalness: 0.1,
	});

	const topBottom = new BoxGeometry(WALL_FRAME_W, WF_BORDER, WF_DEPTH + 0.005);
	const leftRight = new BoxGeometry(WF_BORDER, WALL_FRAME_H, WF_DEPTH + 0.005);
	const bz = 0.003;

	const topMesh = new Mesh(topBottom, borderMat);
	topMesh.position.set(0, WALL_FRAME_H / 2 - WF_BORDER / 2, bz);
	g.add(topMesh);

	const bottomMesh = new Mesh(topBottom, borderMat);
	bottomMesh.position.set(0, -(WALL_FRAME_H / 2 - WF_BORDER / 2), bz);
	g.add(bottomMesh);

	const leftMesh = new Mesh(leftRight, borderMat);
	leftMesh.position.set(-(WALL_FRAME_W / 2 - WF_BORDER / 2), 0, bz);
	g.add(leftMesh);

	const rightMesh = new Mesh(leftRight, borderMat);
	rightMesh.position.set(WALL_FRAME_W / 2 - WF_BORDER / 2, 0, bz);
	g.add(rightMesh);

	const fz = WF_DEPTH / 2 + 0.001;

	const imagePlane = createImagePlane(WF_IMAGE_W, WF_IMAGE_H, spotlight?.image);
	imagePlane.position.set(0, 0.015, fz);
	(imagePlane.material as MeshStandardMaterial).side = DoubleSide;
	g.add(imagePlane);

	const nameplate = createNameplate(WF_IMAGE_W * 0.8, 0.035, spotlight);
	nameplate.position.set(0, -(WALL_FRAME_H / 2 - WF_BORDER - 0.022), fz + 0.001);
	(nameplate.material as MeshStandardMaterial).side = DoubleSide;
	g.add(nameplate);

	return g;
}
