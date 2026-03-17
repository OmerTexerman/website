import {
	CircleGeometry,
	Color,
	CylinderGeometry,
	Group,
	Mesh,
	MeshStandardMaterial,
	PointLight,
	SphereGeometry,
} from "three";
import { metalMaterial } from "../materials";

/** Desk lamp — built hierarchically so parts stay connected.
 *  base → armPivot → arm + headPivot → shade (conical) + bulb + light
 */
export function createDeskLamp(): Group {
	const lamp = new Group();

	// ── Base disc ──
	const baseGeo = new CylinderGeometry(0.18, 0.2, 0.04, 16);
	const base = new Mesh(baseGeo, metalMaterial);
	base.position.set(0, 0.02, 0);
	base.castShadow = true;
	lamp.add(base);

	// ── Arm pivot — tilts backward slightly ──
	const armPivot = new Group();
	armPivot.position.set(0, 0.04, 0);
	armPivot.rotation.x = 0.15;
	lamp.add(armPivot);

	// Arm
	const armGeo = new CylinderGeometry(0.018, 0.018, 0.9, 8);
	const arm = new Mesh(armGeo, metalMaterial);
	arm.position.set(0, 0.45, 0);
	arm.castShadow = true;
	armPivot.add(arm);

	// ── Head pivot — at top of arm, tilts forward to aim down ──
	const headPivot = new Group();
	headPivot.position.set(0, 0.9, 0);
	headPivot.rotation.x = 0.6;
	armPivot.add(headPivot);

	// Shade — clearly conical (wide bottom, narrow top, open bottom)
	const shadeMat = new MeshStandardMaterial({
		color: new Color("#3a3a3a"),
		roughness: 0.8,
		metalness: 0.3,
	});
	// Top-closed cone: small top radius, larger bottom, reasonable height
	const shadeGeo = new CylinderGeometry(0.03, 0.16, 0.14, 12);
	const shade = new Mesh(shadeGeo, shadeMat);
	shade.position.set(0, -0.04, 0);
	shade.castShadow = true;
	headPivot.add(shade);

	// Inner glow disc at the bottom opening (faces down)
	const innerGlowMat = new MeshStandardMaterial({
		color: new Color("#ffcc88"),
		emissive: new Color("#ffcc88"),
		emissiveIntensity: 1.5,
	});
	const innerGlowGeo = new CircleGeometry(0.15, 12);
	const innerGlow = new Mesh(innerGlowGeo, innerGlowMat);
	innerGlow.position.set(0, -0.11, 0);
	innerGlow.rotation.x = Math.PI / 2;
	headPivot.add(innerGlow);

	// Tiny bulb inside
	const bulbMat = new MeshStandardMaterial({
		color: new Color("#ffcc88"),
		emissive: new Color("#ffcc88"),
		emissiveIntensity: 1.5,
	});
	const bulbGeo = new SphereGeometry(0.02, 6, 6);
	const bulb = new Mesh(bulbGeo, bulbMat);
	bulb.position.set(0, -0.06, 0);
	headPivot.add(bulb);

	// Point light
	const light = new PointLight(new Color("#ffcc88"), 3.0, 12, 1.5);
	light.position.set(0, -0.12, 0);
	light.castShadow = true;
	light.shadow.mapSize.width = 1024;
	light.shadow.mapSize.height = 1024;
	light.shadow.radius = 4;
	headPivot.add(light);

	lamp.position.set(1.8, 0.12, -0.8);

	return lamp;
}
