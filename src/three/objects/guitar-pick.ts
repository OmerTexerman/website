import { ExtrudeGeometry, Group, Mesh, Shape } from "three";
import { accentMaterial } from "../materials";
import { DESK_SURFACE_Y } from "../math-utils";

/** Decorative guitar pick — rounded triangle */
export function createGuitarPick(): Group {
	const pick = new Group();
	pick.userData = { draggable: true };

	const shape = new Shape();
	const s = 0.06;
	shape.moveTo(0, -s * 1.5);
	shape.quadraticCurveTo(-s * 1.2, s * 0.3, -s * 0.5, s * 1.2);
	shape.quadraticCurveTo(0, s * 1.6, s * 0.5, s * 1.2);
	shape.quadraticCurveTo(s * 1.2, s * 0.3, 0, -s * 1.5);

	const geo = new ExtrudeGeometry(shape, {
		depth: 0.008,
		bevelEnabled: true,
		bevelThickness: 0.003,
		bevelSize: 0.003,
		bevelSegments: 3,
	});

	const mesh = new Mesh(geo, accentMaterial);
	mesh.rotation.x = -Math.PI / 2;
	mesh.castShadow = true;
	pick.add(mesh);

	pick.position.set(0.8, DESK_SURFACE_Y, 0.9);
	pick.rotation.y = 0.8;

	return pick;
}
