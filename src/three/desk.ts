import { BoxGeometry, Color, Group, Mesh, MeshStandardMaterial, PlaneGeometry } from "three";
import { GROUND_DARK } from "./colors";
import { darkWoodMaterial, woodMaterial } from "./materials";

export function createDesk(): Group {
	const desk = new Group();

	// Desktop surface
	const topGeo = new BoxGeometry(5, 0.12, 3);
	const top = new Mesh(topGeo, woodMaterial);
	top.position.set(0, 0, 0);
	top.receiveShadow = true;
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

	// Ground plane — subtle dark surface so legs don't float into void
	const groundMat = new MeshStandardMaterial({
		color: new Color(GROUND_DARK),
		roughness: 0.95,
		metalness: 0.0,
	});
	const groundGeo = new PlaneGeometry(20, 20);
	const ground = new Mesh(groundGeo, groundMat);
	ground.rotation.x = -Math.PI / 2;
	ground.position.set(0, -2, 0);
	ground.receiveShadow = true;
	desk.add(ground);

	return desk;
}
