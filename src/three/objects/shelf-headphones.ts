import { Color, CylinderGeometry, Group, Mesh, MeshStandardMaterial, TorusGeometry } from "three";
import { DARK_GRAY, DARK_METAL } from "../colors";

const padMaterial = new MeshStandardMaterial({
	color: new Color(DARK_GRAY),
	roughness: 0.85,
	metalness: 0.1,
});

const bandMaterial = new MeshStandardMaterial({
	color: new Color(DARK_METAL),
	roughness: 0.3,
	metalness: 0.7,
});

const cushionMaterial = new MeshStandardMaterial({
	color: new Color("#2a2a2a"),
	roughness: 0.95,
	metalness: 0.0,
});

/**
 * Headphones leaning against the back wall of a shelf.
 * The headband arch faces outward with ear cups resting on the shelf surface.
 * Tap to make the ear cups pulse like they're playing music.
 */
export function createShelfHeadphones(): Group {
	const hp = new Group();
	hp.userData = { interactive: true };

	// Body group — we tilt this back to lean against the wall
	const body = new Group();
	hp.add(body);

	// Headband — arch sitting upright, opening facing down
	const band = new Mesh(new TorusGeometry(0.13, 0.012, 8, 24, Math.PI), bandMaterial);
	// Arch upright: open end faces down
	band.position.y = 0.13;
	band.castShadow = true;
	body.add(band);

	// Ear cups — at the ends of the band, resting near the shelf
	const cupGeo = new CylinderGeometry(0.05, 0.05, 0.025, 16);
	const cushionGeo = new CylinderGeometry(0.045, 0.045, 0.008, 16);

	const leftCup = new Group();
	const leftPad = new Mesh(cupGeo, padMaterial);
	leftPad.castShadow = true;
	leftCup.add(leftPad);
	const leftCushion = new Mesh(cushionGeo, cushionMaterial);
	leftCushion.position.y = -0.016;
	leftCup.add(leftCushion);
	// Rotate cups so their flat face is parallel to the wall
	leftCup.rotation.x = Math.PI / 2;
	leftCup.position.set(-0.13, 0.0, 0.013);
	body.add(leftCup);

	const rightCup = new Group();
	const rightPad = new Mesh(cupGeo, padMaterial);
	rightPad.castShadow = true;
	rightCup.add(rightPad);
	const rightCushion = new Mesh(cushionGeo, cushionMaterial);
	rightCushion.position.y = -0.016;
	rightCup.add(rightCushion);
	rightCup.rotation.x = Math.PI / 2;
	rightCup.position.set(0.13, 0.0, 0.013);
	body.add(rightCup);

	// Lean the whole body back against the wall
	body.rotation.x = -0.35;

	hp.userData.cups = { left: leftCup, right: rightCup };

	return hp;
}
