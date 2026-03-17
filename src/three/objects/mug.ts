import { CylinderGeometry, Group, Mesh, TorusGeometry } from "three";
import { ceramicMaterial } from "../materials";

/** Decorative coffee mug */
export function createMug(): Group {
	const mug = new Group();
	mug.userData = { draggable: true };

	// Body
	const bodyGeo = new CylinderGeometry(0.12, 0.1, 0.22, 16);
	const body = new Mesh(bodyGeo, ceramicMaterial);
	body.position.set(0, 0.11, 0);
	body.castShadow = true;
	mug.add(body);

	// Handle
	const handleGeo = new TorusGeometry(0.06, 0.015, 8, 12, Math.PI);
	const handle = new Mesh(handleGeo, ceramicMaterial);
	handle.position.set(0.12, 0.12, 0);
	handle.rotation.z = Math.PI / 2;
	handle.rotation.y = Math.PI / 2;
	mug.add(handle);

	mug.position.set(-0.6, 0.12, 0.9);

	return mug;
}
