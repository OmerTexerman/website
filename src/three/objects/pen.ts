import { ConeGeometry, CylinderGeometry, Group, Mesh } from "three";
import { accentMaterial, metalMaterial } from "../materials";

/** Decorative pen */
export function createPen(): Group {
	const pen = new Group();
	pen.userData = { draggable: true };

	// Body
	const bodyGeo = new CylinderGeometry(0.02, 0.02, 0.5, 8);
	const body = new Mesh(bodyGeo, metalMaterial);
	pen.add(body);

	// Tip
	const tipGeo = new ConeGeometry(0.02, 0.04, 8);
	const tip = new Mesh(tipGeo, accentMaterial);
	tip.position.set(0, -0.27, 0);
	pen.add(tip);

	// Clip
	const clipGeo = new CylinderGeometry(0.005, 0.005, 0.15, 4);
	const clip = new Mesh(clipGeo, metalMaterial);
	clip.position.set(0.025, 0.12, 0);
	pen.add(clip);

	pen.position.set(-0.3, 0.15, 0.8);
	pen.rotation.z = Math.PI / 2;
	pen.rotation.y = 0.3;

	return pen;
}
