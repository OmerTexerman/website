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
import { SHADOW_BIAS } from "../constants";
import { metalMaterial } from "../materials";
import { DESK_SURFACE_Y } from "../math-utils";

const LAMP_ON_INTENSITY = 5.0;

// Arm articulation, all in the local x/y plane: the lower arm leans away
// from the lit spot, the upper arm folds back over it. The whole lamp is
// yawed so this plane contains the aim direction — a real lamp's arm folds
// in line with where it points, not sideways to it.
const LOWER_TILT = -0.35;
const LOWER_LEN = 0.5;
const UPPER_TILT = 0.85; // relative to the lower arm
const UPPER_LEN = 0.48;
const HEAD_TILT = -0.65;
const LAMP_YAW = 0.675; // aligns local -x with the world aim direction

/** Desk lamp — a small articulated task lamp.
 *  base → lower arm (leans away) → elbow → upper arm (folds back over the
 *  desk) → head with a conical shade aimed at the desk surface.
 *
 *  Uses a SpotLight aimed at the desk surface for a realistic cone of light.
 *  The lamp is clickable — toggling it on/off is a micro-interaction.
 */
export function createDeskLamp(): Group {
	const lamp = new Group();
	lamp.userData = { interactive: true, lampOn: true };

	const jointMat = new MeshStandardMaterial({
		color: new Color(DARK_GRAY),
		roughness: 0.6,
		metalness: 0.4,
	});

	// ── Base disc with a ball joint ──
	const base = new Mesh(new CylinderGeometry(0.16, 0.19, 0.045, 20), metalMaterial);
	base.position.y = 0.0225;
	base.castShadow = true;
	lamp.add(base);

	const baseJoint = new Mesh(new SphereGeometry(0.05, 12, 12), jointMat);
	baseJoint.position.y = 0.055;
	lamp.add(baseJoint);

	// ── Lower arm ──
	const lowerPivot = new Group();
	lowerPivot.position.y = 0.055;
	lowerPivot.rotation.z = LOWER_TILT;
	lamp.add(lowerPivot);

	const lowerArm = new Mesh(new CylinderGeometry(0.021, 0.021, LOWER_LEN, 10), metalMaterial);
	lowerArm.position.y = LOWER_LEN / 2;
	lowerArm.castShadow = true;
	lowerPivot.add(lowerArm);

	const elbow = new Mesh(new SphereGeometry(0.042, 12, 12), jointMat);
	elbow.position.y = LOWER_LEN;
	lowerPivot.add(elbow);

	// ── Upper arm ──
	const upperPivot = new Group();
	upperPivot.position.y = LOWER_LEN;
	upperPivot.rotation.z = UPPER_TILT;
	lowerPivot.add(upperPivot);

	const upperArm = new Mesh(new CylinderGeometry(0.019, 0.019, UPPER_LEN, 10), metalMaterial);
	upperArm.position.y = UPPER_LEN / 2;
	upperArm.castShadow = true;
	upperPivot.add(upperArm);

	// ── Head — attached at the arm tip but aimed independently so the shade
	// points at the lit spot on the desk regardless of arm articulation ──
	const netTilt = LOWER_TILT + UPPER_TILT;
	const headX = -LOWER_LEN * Math.sin(LOWER_TILT) - UPPER_LEN * Math.sin(netTilt);
	const headY = 0.055 + LOWER_LEN * Math.cos(LOWER_TILT) + UPPER_LEN * Math.cos(netTilt);
	const head = new Group();
	head.position.set(headX, headY, 0);
	// The lamp yaw keeps the aim in the arm plane, so a single-axis tilt
	// points the shade at the lit spot
	head.rotation.z = HEAD_TILT;
	lamp.add(head);

	const neck = new Mesh(new SphereGeometry(0.032, 12, 12), jointMat);
	head.add(neck);

	// Shade
	const shadeMat = new MeshStandardMaterial({
		color: new Color(DARK_GRAY),
		roughness: 0.8,
		metalness: 0.3,
	});
	const shade = new Mesh(new CylinderGeometry(0.035, 0.14, 0.16, 16), shadeMat);
	shade.position.y = -0.045;
	shade.castShadow = true;
	head.add(shade);

	// Warm glow material for inner surfaces
	const glowMat = new MeshStandardMaterial({
		color: new Color(WARM_GLOW),
		emissive: new Color(WARM_GLOW),
		emissiveIntensity: 1.5,
	});

	// Inner glow disc at the bottom opening
	const innerGlow = new Mesh(new CircleGeometry(0.13, 16), glowMat);
	innerGlow.position.y = -0.12;
	innerGlow.rotation.x = Math.PI / 2;
	head.add(innerGlow);

	// Tiny bulb
	const bulb = new Mesh(new SphereGeometry(0.02, 6, 6), glowMat);
	bulb.position.y = -0.07;
	head.add(bulb);

	// SpotLight — wide cone aimed at the desk center
	const light = new SpotLight(new Color(WARM_GLOW), LAMP_ON_INTENSITY, 10, Math.PI / 3, 0.6, 1.2);
	light.position.set(0, -0.13, 0);
	light.castShadow = true;
	light.shadow.mapSize.width = 1024;
	light.shadow.mapSize.height = 1024;
	light.shadow.radius = 4;
	light.shadow.bias = SHADOW_BIAS;
	light.shadow.camera.near = 0.2;
	head.add(light);

	// Target along local -x; after the lamp yaw this lands at the same world
	// spot as the old (-1, 0, 0.8) aim toward the desk center
	const lightTarget = new Object3D();
	lightTarget.position.set(-1.28, 0, 0);
	lamp.add(lightTarget);
	light.target = lightTarget;

	// Store references for toggling
	lamp.userData.lightParts = { light, glowMat };

	lamp.position.set(1.8, DESK_SURFACE_Y, -0.8);
	lamp.rotation.y = LAMP_YAW;

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
