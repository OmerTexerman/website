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
 * Headphones lying flat on a shelf surface.
 * The headband sits flat with ear cups on either side, as if set down casually.
 * Tap to make the ear cups pulse like they're playing music.
 */
export function createShelfHeadphones(): Group {
	const hp = new Group();
	hp.userData = { interactive: true };

	// Headband — half-torus lying flat (rotated so it rests on the shelf)
	const band = new Mesh(new TorusGeometry(0.14, 0.012, 8, 24, Math.PI), bandMaterial);
	band.rotation.x = Math.PI / 2;
	band.position.y = 0.012;
	hp.add(band);

	// Ear cups — two cylinders at the ends of the band
	const cupGeo = new CylinderGeometry(0.055, 0.055, 0.03, 16);
	const cushionGeo = new CylinderGeometry(0.05, 0.05, 0.008, 16);

	const leftCup = new Group();
	const leftPad = new Mesh(cupGeo, padMaterial);
	leftPad.castShadow = true;
	leftCup.add(leftPad);
	const leftCushion = new Mesh(cushionGeo, cushionMaterial);
	leftCushion.position.y = -0.019;
	leftCup.add(leftCushion);
	// Lying flat: cup axis is vertical, position at band end
	leftCup.position.set(-0.14, 0.015, 0);
	hp.add(leftCup);

	const rightCup = new Group();
	const rightPad = new Mesh(cupGeo, padMaterial);
	rightPad.castShadow = true;
	rightCup.add(rightPad);
	const rightCushion = new Mesh(cushionGeo, cushionMaterial);
	rightCushion.position.y = -0.019;
	rightCup.add(rightCushion);
	rightCup.position.set(0.14, 0.015, 0);
	hp.add(rightCup);

	hp.userData.cups = { left: leftCup, right: rightCup };

	return hp;
}
