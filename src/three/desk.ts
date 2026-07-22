import { BoxGeometry, Group, Mesh } from "three";
import { darkWoodMaterial, woodMaterial } from "./materials";
import { DESK_SURFACE_Y } from "./math-utils";

export function createDesk(): Group {
	const desk = new Group();

	// Desktop surface — top face flush with DESK_SURFACE_Y so objects sit on
	// it, and casting shadows so the lamp can't shine through onto the floor.
	const topGeo = new BoxGeometry(5, 0.12, 3);
	const top = new Mesh(topGeo, woodMaterial);
	top.position.set(0, DESK_SURFACE_Y - 0.06, 0);
	top.receiveShadow = true;
	top.castShadow = true;
	desk.add(top);

	// Legs
	const legGeo = new BoxGeometry(0.15, 2, 0.15);
	const positions = [
		[-2.3, -1, 1.3],
		[2.3, -1, 1.3],
		[-2.3, -1, -1.3],
		[2.3, -1, -1.3],
	] as const;

	for (const [x, y, z] of positions) {
		const leg = new Mesh(legGeo, darkWoodMaterial);
		leg.position.set(x, y, z);
		leg.castShadow = true;
		desk.add(leg);
	}

	return desk;
}
