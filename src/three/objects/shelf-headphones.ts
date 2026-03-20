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

	// Headband — half-torus arch. Default torus(PI) lies in XY with endpoints
	// at (±R, 0, 0) and the arch going up through (0, R, 0).
	// Rotate so the arch goes up in Y, opening faces down.
	const bandRadius = 0.12;
	const band = new Mesh(new TorusGeometry(bandRadius, 0.01, 8, 24, Math.PI), bandMaterial);
	band.rotation.z = Math.PI / 2; // rotate so arch opens downward, endpoints at (0, ±R, 0)
	band.position.y = bandRadius; // lift so endpoints sit at y=0 and y=2R
	band.castShadow = true;
	body.add(band);

	// Ear cups — cylinders with flat faces outward (along Z).
	// Position at the band endpoints: (0, 0, 0) and (0, 2*bandRadius, 0)
	const cupGeo = new CylinderGeometry(0.05, 0.05, 0.03, 16);
	const cushionGeo = new CylinderGeometry(0.044, 0.044, 0.006, 16);

	function makeCup(): Group {
		const cup = new Group();
		const pad = new Mesh(cupGeo, padMaterial);
		pad.rotation.x = Math.PI / 2; // flat face along Z
		pad.castShadow = true;
		cup.add(pad);
		const cushion = new Mesh(cushionGeo, cushionMaterial);
		cushion.rotation.x = Math.PI / 2;
		cushion.position.z = 0.018;
		cup.add(cushion);
		return cup;
	}

	const leftCup = makeCup();
	leftCup.position.set(0, 0, 0);
	body.add(leftCup);

	const rightCup = makeCup();
	rightCup.position.set(0, bandRadius * 2, 0);
	body.add(rightCup);

	// Rotate so the headband arch plane faces outward (toward the viewer)
	// and the two cups sit side by side horizontally on the shelf
	body.rotation.z = Math.PI / 2; // cups now left/right along X, arch in XY
	body.position.y = bandRadius * 2; // lift so bottom cup sits on shelf surface

	// Lean back against the wall
	body.rotation.x = -0.4;

	hp.userData.cups = { left: leftCup, right: rightCup };

	return hp;
}
