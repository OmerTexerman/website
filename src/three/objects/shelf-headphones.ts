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
 * Tap to make the ear cups pulse like they're playing music.
 */
export function createShelfHeadphones(): Group {
	const hp = new Group();
	hp.userData = { interactive: true };

	const body = new Group();
	hp.add(body);

	const bandRadius = 0.14;
	const cupRadius = 0.1;
	const bandTube = 0.016;

	// Headband — half-torus arch stretched vertically for an oval shape.
	// Endpoints at (±bandRadius, 0, 0), peak at (0, bandRadius * scaleY, 0).
	const band = new Mesh(new TorusGeometry(bandRadius, bandTube, 8, 24, Math.PI), bandMaterial);
	band.scale.y = 1.45; // stretch upward for taller oval arch
	band.position.y = cupRadius + 0.02;
	band.castShadow = true;
	body.add(band);

	// Ear cups — large cylinders with flat faces outward.
	// Inset slightly from band endpoints so cups overlap naturally.
	const cupGeo = new CylinderGeometry(cupRadius, cupRadius, 0.04, 16);
	const cushionGeo = new CylinderGeometry(cupRadius - 0.006, cupRadius - 0.006, 0.006, 16);
	const cupX = bandRadius - 0.005;

	function makeCup(): Group {
		const cup = new Group();
		const pad = new Mesh(cupGeo, padMaterial);
		pad.rotation.x = Math.PI / 2;
		pad.castShadow = true;
		cup.add(pad);
		const cushion = new Mesh(cushionGeo, cushionMaterial);
		cushion.rotation.x = Math.PI / 2;
		cushion.position.z = 0.02;
		cup.add(cushion);
		return cup;
	}

	const leftCup = makeCup();
	leftCup.position.set(-cupX, cupRadius, 0);
	body.add(leftCup);

	const rightCup = makeCup();
	rightCup.position.set(cupX, cupRadius, 0);
	body.add(rightCup);

	// Lean back against the wall
	body.rotation.x = -0.36;

	hp.userData.cups = { left: leftCup, right: rightCup };

	return hp;
}
