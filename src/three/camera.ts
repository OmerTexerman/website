import { PerspectiveCamera, Vector3 } from "three";
import { easeInOutCubic } from "./animations";
import { IDLE_AMPLITUDE, IDLE_SPEED, INTRO_DURATION, MOBILE_INTRO_DURATION } from "./constants";

// ─── Desktop (desk) camera poses ────────────────────────────────

const START_POS = new Vector3(4, 12, 10);
const END_POS = new Vector3(0, 5, 7);
const START_LOOK = new Vector3(0, 2, 0);
const END_LOOK = new Vector3(0, 0.5, 0);

export const DESKTOP_POS = END_POS;
export const DESKTOP_LOOK = END_LOOK;

// ─── Mobile (shelf) camera poses ────────────────────────────────
export const MOBILE_POS = new Vector3(5.8, 2.55, 5.95);
export const MOBILE_LOOK = new Vector3(8.5, 2.2, 4.6);
export const MOBILE_INTRO_START_POS = new Vector3(3.9, 3.7, 7.45);

const _lookTarget = new Vector3();
let lastIdleY = END_POS.y;

export function createCamera(aspect: number): PerspectiveCamera {
	const camera = new PerspectiveCamera(45, aspect, 0.1, 100);
	camera.position.copy(START_POS);
	camera.lookAt(START_LOOK);
	return camera;
}

export function animateIntro(camera: PerspectiveCamera, startTime: number, now: number): boolean {
	const progress = Math.min((now - startTime) / INTRO_DURATION, 1);
	const eased = easeInOutCubic(progress);

	camera.position.lerpVectors(START_POS, END_POS, eased);
	_lookTarget.lerpVectors(START_LOOK, END_LOOK, eased);
	camera.lookAt(_lookTarget);

	return progress >= 1;
}

/** Mobile intro: camera swoops in to shelf wall */
export function animateMobileIntro(
	camera: PerspectiveCamera,
	startTime: number,
	now: number,
): boolean {
	const progress = Math.min((now - startTime) / MOBILE_INTRO_DURATION, 1);
	const eased = easeInOutCubic(progress);

	camera.position.lerpVectors(MOBILE_INTRO_START_POS, MOBILE_POS, eased);
	_lookTarget.lerpVectors(MOBILE_LOOK, MOBILE_LOOK, eased);
	camera.lookAt(_lookTarget);

	return progress >= 1;
}

/** Returns true if the camera actually moved enough to warrant a re-render */
export function idleFloat(camera: PerspectiveCamera, time: number): boolean {
	const newY = END_POS.y + Math.sin(time * IDLE_SPEED) * IDLE_AMPLITUDE;
	if (Math.abs(newY - lastIdleY) < 0.0005) return false;
	lastIdleY = newY;
	camera.position.y = newY;
	camera.lookAt(END_LOOK);
	return true;
}

/** Interpolate camera between two poses at factor t (0..1) */
export function lerpCameraPose(
	camera: PerspectiveCamera,
	fromPos: Vector3,
	toPos: Vector3,
	fromLook: Vector3,
	toLook: Vector3,
	t: number,
): void {
	camera.position.lerpVectors(fromPos, toPos, t);
	_lookTarget.lerpVectors(fromLook, toLook, t);
	camera.lookAt(_lookTarget);
}
