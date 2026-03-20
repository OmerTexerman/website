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

	const bandRadius = 0.08;
	const cupRadius = 0.065;

	// Headband — half-torus in XY plane.
	// Endpoints at (±bandRadius, 0, 0), peak at (0, bandRadius, 0).
	// Lift so endpoints align with cup centers.
	const band = new Mesh(new TorusGeometry(bandRadius, 0.013, 8, 24, Math.PI), bandMaterial);
	band.position.y = cupRadius;
	band.castShadow = true;
	body.add(band);

	// Ear cups — cylinder axis rotated to Z so flat faces point forward/back.
	// Positioned at band endpoints, lifted so bottom of cup circle sits at y=0.
	const cupGeo = new CylinderGeometry(cupRadius, cupRadius, 0.03, 16);
	const cushionGeo = new CylinderGeometry(cupRadius - 0.006, cupRadius - 0.006, 0.006, 16);

	function makeCup(): Group {
		const cup = new Group();
		const pad = new Mesh(cupGeo, padMaterial);
		pad.rotation.x = Math.PI / 2;
		pad.castShadow = true;
		cup.add(pad);
		const cushion = new Mesh(cushionGeo, cushionMaterial);
		cushion.rotation.x = Math.PI / 2;
		cushion.position.z = 0.018;
		cup.add(cushion);
		return cup;
	}

	const leftCup = makeCup();
	leftCup.position.set(-bandRadius, cupRadius, 0);
	body.add(leftCup);

	const rightCup = makeCup();
	rightCup.position.set(bandRadius, cupRadius, 0);
	body.add(rightCup);

	// Lean back against the wall (+Z is toward wall after shelf rotation.y)
	body.rotation.x = -0.45;

	hp.userData.cups = { left: leftCup, right: rightCup };

	return hp;
}
