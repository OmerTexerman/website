import {
	BoxGeometry,
	Color,
	CylinderGeometry,
	Group,
	Mesh,
	MeshPhysicalMaterial,
	MeshStandardMaterial,
	SphereGeometry,
} from "three";
import { SILVER_METAL } from "../colors";
import { accentMaterial } from "../materials";
import { DESK_SURFACE_Y } from "../math-utils";

const BODY_RADIUS = 0.019;

/** Decorative pen — lacquered barrel with polished trim, nose cone, and clip */
export function createPen(): Group {
	const pen = new Group();
	pen.userData = { draggable: true, interactive: true };

	const lacquerMat = new MeshPhysicalMaterial({
		color: new Color("#20242e"),
		roughness: 0.25,
		metalness: 0.1,
		clearcoat: 0.8,
		clearcoatRoughness: 0.2,
	});
	const trimMat = new MeshStandardMaterial({
		color: new Color(SILVER_METAL),
		roughness: 0.25,
		metalness: 0.9,
	});

	// Upper barrel (cap section)
	const cap = new Mesh(new CylinderGeometry(0.0185, BODY_RADIUS, 0.22, 16), lacquerMat);
	cap.position.y = 0.13;
	cap.castShadow = true;
	pen.add(cap);

	// Center band at the cap seam
	const band = new Mesh(new CylinderGeometry(0.0195, 0.0195, 0.014, 16), trimMat);
	band.position.y = 0.015;
	pen.add(band);

	// Lower barrel, tapering toward the nose
	const barrel = new Mesh(new CylinderGeometry(BODY_RADIUS, 0.015, 0.2, 16), lacquerMat);
	barrel.position.y = -0.092;
	barrel.castShadow = true;
	pen.add(barrel);

	// Nose cone and tip
	const nose = new Mesh(new CylinderGeometry(0.015, 0.005, 0.055, 16), trimMat);
	nose.position.y = -0.2195;
	pen.add(nose);

	const tip = new Mesh(new CylinderGeometry(0.005, 0.0015, 0.014, 8), trimMat);
	tip.position.y = -0.254;
	pen.add(tip);

	// Finial and accent clicker at the top
	const finial = new Mesh(new CylinderGeometry(0.012, 0.0185, 0.018, 16), trimMat);
	finial.position.y = 0.249;
	pen.add(finial);

	const clicker = new Mesh(new CylinderGeometry(0.009, 0.011, 0.018, 16), accentMaterial);
	clicker.position.y = 0.267;
	pen.add(clicker);

	// Clip — a thin blade hugging the barrel, mounted below the finial.
	// Sits on the local +x side, which faces up once the pen lies on the desk.
	const clipMount = new Mesh(new BoxGeometry(0.012, 0.018, 0.009), trimMat);
	clipMount.position.set(0.019, 0.235, 0);
	pen.add(clipMount);

	const clip = new Mesh(new BoxGeometry(0.0035, 0.125, 0.008), trimMat);
	clip.position.set(0.0245, 0.1755, 0);
	pen.add(clip);

	const clipBall = new Mesh(new SphereGeometry(0.005, 8, 8), trimMat);
	clipBall.position.set(0.0235, 0.115, 0);
	pen.add(clipBall);

	pen.position.set(0.15, DESK_SURFACE_Y + BODY_RADIUS, 0.95);
	pen.rotation.z = Math.PI / 2;
	pen.rotation.y = 0.3;

	return pen;
}
