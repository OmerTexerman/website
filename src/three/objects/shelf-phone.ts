import { BoxGeometry, Color, CylinderGeometry, Group, Mesh, MeshStandardMaterial } from "three";
import { DARK_GRAY, VERY_DARK_GRAY } from "../colors";

/**
 * Smartphone lying flat on the shelf.
 * Simple box construction — no ExtrudeGeometry to avoid rotation/bevel issues.
 */
export function createShelfPhone(): Group {
	const g = new Group();

	const W = 0.2;
	const H = 0.4;
	const D = 0.02;

	// Body — simple box lying flat on the shelf
	const bodyMat = new MeshStandardMaterial({
		color: new Color(VERY_DARK_GRAY),
		roughness: 0.35,
		metalness: 0.5,
	});
	const body = new Mesh(new BoxGeometry(W, D, H), bodyMat);
	body.position.y = D / 2;
	g.add(body);

	// Screen — starts dark, lights up on tap
	const screenW = W - 0.02;
	const screenH = H - 0.04;
	const phoneScreenMat = new MeshStandardMaterial({
		color: new Color(0x6a9fcc),
		emissive: new Color(0x6a9fcc),
		emissiveIntensity: 0,
		roughness: 0.0,
		metalness: 0.0,
	});
	const screen = new Mesh(new BoxGeometry(screenW, 0.002, screenH), phoneScreenMat);
	screen.position.y = D + 0.001;
	g.add(screen);

	// Side buttons
	const buttonMat = new MeshStandardMaterial({
		color: new Color(DARK_GRAY),
		roughness: 0.3,
		metalness: 0.7,
	});
	const power = new Mesh(new BoxGeometry(0.004, 0.005, 0.06), buttonMat);
	power.position.set(W / 2 + 0.002, D / 2, -0.02);
	g.add(power);

	const vol = new Mesh(new BoxGeometry(0.004, 0.005, 0.04), buttonMat);
	vol.position.set(-(W / 2 + 0.002), D / 2, -0.03);
	g.add(vol);

	// Camera bump on the back
	const cameraBump = new Mesh(
		new CylinderGeometry(0.014, 0.014, 0.005, 12),
		new MeshStandardMaterial({ color: new Color(DARK_GRAY), roughness: 0.2, metalness: 0.7 }),
	);
	cameraBump.position.set(-W / 2 + 0.04, -0.002, -(H / 2 - 0.05));
	g.add(cameraBump);

	// Store screen material ref for wake animation
	g.userData.screenMaterial = phoneScreenMat;

	g.position.set(0, 0, 0);
	return g;
}
