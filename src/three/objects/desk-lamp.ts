import {
	BackSide,
	Color,
	CylinderGeometry,
	FrontSide,
	Group,
	LatheGeometry,
	type Light,
	Mesh,
	MeshStandardMaterial,
	Object3D,
	SphereGeometry,
	SpotLight,
	Vector2,
	Vector3,
} from "three";
import { VERY_DARK_GRAY, WARM_GLOW } from "../colors";

import { SHADOW_BIAS } from "../constants";
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
const LAMP_YAW = 0.675; // aligns local -x with the world aim direction
/** Lit spot on the desk, along the lamp's local -x. */
const LIGHT_TARGET_X = -1.28;
/** How brightly the inside of the shade glows while the lamp is on. */
const INNER_ON = 0.9;
/** Bulb brightness while on; high enough for the bloom pass to halo it. */
const BULB_ON = 3.0;

/** Desk lamp — a simple articulated task lamp in the desk's blocky style:
 *  round base → lower arm (leans away) → elbow → upper arm (folds back over
 *  the desk) → dome shade aimed straight at the lit spot, glowing inside.
 *
 *  Uses a SpotLight aimed at the desk surface for a realistic cone of light.
 *  The lamp is clickable — toggling it on/off is a micro-interaction.
 */
export function createDeskLamp(): Group {
	const lamp = new Group();
	lamp.userData = { interactive: true, lampOn: true };

	const bodyMat = new MeshStandardMaterial({
		color: new Color(0x1c1c1e),
		roughness: 0.6,
		metalness: 0.3,
	});

	// ── Base ──
	const base = new Mesh(new CylinderGeometry(0.17, 0.19, 0.05, 20), bodyMat);
	base.position.y = 0.025;
	base.castShadow = true;
	lamp.add(base);

	const PIVOT_Y = 0.07;
	addJoint(lamp, PIVOT_Y, bodyMat);

	// ── Lower arm ──
	const lowerPivot = new Group();
	lowerPivot.position.y = PIVOT_Y;
	lowerPivot.rotation.z = LOWER_TILT;
	lamp.add(lowerPivot);
	addArm(lowerPivot, LOWER_LEN, bodyMat);
	addJoint(lowerPivot, LOWER_LEN, bodyMat);

	// ── Upper arm ──
	const upperPivot = new Group();
	upperPivot.position.y = LOWER_LEN;
	upperPivot.rotation.z = UPPER_TILT;
	lowerPivot.add(upperPivot);
	addArm(upperPivot, UPPER_LEN, bodyMat);

	// ── Head: at the arm tip, its shade axis aimed straight at the lit spot ──
	const netTilt = LOWER_TILT + UPPER_TILT;
	const headX = -LOWER_LEN * Math.sin(LOWER_TILT) - UPPER_LEN * Math.sin(netTilt);
	const headY = PIVOT_Y + LOWER_LEN * Math.cos(LOWER_TILT) + UPPER_LEN * Math.cos(netTilt);
	const head = new Group();
	head.position.set(headX, headY, 0);
	const aim = new Vector3(LIGHT_TARGET_X, 0, 0).sub(head.position).normalize();
	head.quaternion.setFromUnitVectors(new Vector3(0, -1, 0), aim);
	lamp.add(head);

	addJoint(head, 0, bodyMat);

	// Dome shade: one low-poly lathe profile, dark outside, lit inside.
	// Lathe faces point outward when the profile runs bottom-to-top.
	const shadeGeo = new LatheGeometry(
		[
			new Vector2(0.145, -0.175),
			new Vector2(0.12, -0.1),
			new Vector2(0.07, -0.03),
			new Vector2(0.03, 0),
		],
		16,
	);
	const shade = new Mesh(
		shadeGeo,
		new MeshStandardMaterial({
			color: new Color(0x1c1c1e),
			roughness: 0.6,
			metalness: 0.3,
			side: FrontSide,
		}),
	);
	shade.position.y = -0.03;
	shade.castShadow = true;
	head.add(shade);

	const innerMat = new MeshStandardMaterial({
		color: new Color(0xf1e6d2),
		emissive: new Color(WARM_GLOW),
		emissiveIntensity: INNER_ON,
		roughness: 0.9,
		metalness: 0,
		side: BackSide,
	});
	const inner = new Mesh(shadeGeo, innerMat);
	inner.position.y = -0.03;
	head.add(inner);

	// Bulb, tucked up inside the dome.
	const glowMat = new MeshStandardMaterial({
		color: new Color(WARM_GLOW),
		emissive: new Color(WARM_GLOW),
		emissiveIntensity: BULB_ON,
	});
	const bulb = new Mesh(new SphereGeometry(0.045, 10, 8), glowMat);
	bulb.position.y = -0.13;
	head.add(bulb);

	// SpotLight — wide cone aimed at the desk center
	const light = new SpotLight(new Color(WARM_GLOW), LAMP_ON_INTENSITY, 10, Math.PI / 3, 0.6, 1.2);
	light.position.set(0, -0.19, 0);
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
	lightTarget.position.set(LIGHT_TARGET_X, 0, 0);
	lamp.add(lightTarget);
	light.target = lightTarget;

	// Store references for toggling
	lamp.userData.lightParts = { light, glowMat, innerMat };

	lamp.position.set(1.8, DESK_SURFACE_Y, -0.8);
	lamp.rotation.y = LAMP_YAW;

	return lamp;
}

/** A single straight arm running along +y from its pivot. */
function addArm(pivot: Group, length: number, mat: MeshStandardMaterial): void {
	const arm = new Mesh(new CylinderGeometry(0.022, 0.022, length, 8), mat);
	arm.position.y = length / 2;
	arm.castShadow = true;
	pivot.add(arm);
}

/** A plain joint: a short drum across the arm. */
function addJoint(parent: Group, y: number, mat: MeshStandardMaterial): void {
	const joint = new Mesh(new CylinderGeometry(0.035, 0.035, 0.07, 12), mat);
	joint.rotation.x = Math.PI / 2;
	joint.position.y = y;
	parent.add(joint);
}

export function toggleLamp(lamp: Group): boolean {
	const on = !lamp.userData.lampOn;
	lamp.userData.lampOn = on;
	const { light, glowMat, innerMat } = lamp.userData.lightParts as {
		light: Light;
		glowMat: MeshStandardMaterial;
		innerMat: MeshStandardMaterial;
	};
	innerMat.emissiveIntensity = on ? INNER_ON : 0;
	light.intensity = on ? LAMP_ON_INTENSITY : 0;
	glowMat.emissiveIntensity = on ? BULB_ON : 0;
	glowMat.color.set(on ? WARM_GLOW : VERY_DARK_GRAY);
	return on;
}
