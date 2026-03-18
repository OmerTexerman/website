import {
	CircleGeometry,
	Color,
	CylinderGeometry,
	Group,
	type Light,
	Mesh,
	MeshStandardMaterial,
	Object3D,
	SphereGeometry,
	SpotLight,
} from "three";
import { DARK_GRAY, VERY_DARK_GRAY, WARM_GLOW } from "../colors";
import { metalMaterial } from "../materials";
import { DESK_SURFACE_Y } from "../math-utils";

const LAMP_ON_INTENSITY = 5.0;

/** Desk lamp — built hierarchically so parts stay connected.
 *  base → armPivot → arm + headPivot → shade (conical) + bulb + light
 *
 *  Uses a SpotLight aimed at the desk surface for a realistic cone of light.
 *  The lamp is clickable — toggling it on/off is a micro-interaction.
 */
export function createDeskLamp(): Group {
	const lamp = new Group();
	lamp.userData = { interactive: true, lampOn: true };

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

	// Shade
	const shadeMat = new MeshStandardMaterial({
		color: new Color(DARK_GRAY),
		roughness: 0.8,
		metalness: 0.3,
	});
	const shadeGeo = new CylinderGeometry(0.03, 0.16, 0.14, 12);
	const shade = new Mesh(shadeGeo, shadeMat);
	shade.position.set(0, -0.04, 0);
	shade.castShadow = true;
	headPivot.add(shade);

	// Warm glow material for inner surfaces
	const glowMat = new MeshStandardMaterial({
		color: new Color(WARM_GLOW),
		emissive: new Color(WARM_GLOW),
		emissiveIntensity: 1.5,
	});

	// Inner glow disc at the bottom opening
	const innerGlow = new Mesh(new CircleGeometry(0.15, 12), glowMat);
	innerGlow.position.set(0, -0.11, 0);
	innerGlow.rotation.x = Math.PI / 2;
	headPivot.add(innerGlow);

	// Tiny bulb
	const bulb = new Mesh(new SphereGeometry(0.02, 6, 6), glowMat);
	bulb.position.set(0, -0.06, 0);
	headPivot.add(bulb);

	// SpotLight — wide cone aimed at the desk center
	const light = new SpotLight(new Color(WARM_GLOW), LAMP_ON_INTENSITY, 10, Math.PI / 3, 0.6, 1.2);
	light.position.set(0, -0.12, 0);
	light.castShadow = true;
	light.shadow.mapSize.width = 1024;
	light.shadow.mapSize.height = 1024;
	light.shadow.radius = 4;
	headPivot.add(light);

	// Target toward desk center (lamp is at x=1.8, so aim left and forward)
	const lightTarget = new Object3D();
	lightTarget.position.set(-1.0, 0, 0.8);
	lamp.add(lightTarget);
	light.target = lightTarget;

	// Store references for toggling
	lamp.userData.lightParts = { light, glowMat };

	lamp.position.set(1.8, DESK_SURFACE_Y, -0.8);

	return lamp;
}

export function toggleLamp(lamp: Group): boolean {
	const on = !lamp.userData.lampOn;
	lamp.userData.lampOn = on;
	const { light, glowMat } = lamp.userData.lightParts as {
		light: Light;
		glowMat: MeshStandardMaterial;
	};
	light.intensity = on ? LAMP_ON_INTENSITY : 0;
	glowMat.emissiveIntensity = on ? 1.5 : 0;
	glowMat.color.set(on ? WARM_GLOW : VERY_DARK_GRAY);
	return on;
}
