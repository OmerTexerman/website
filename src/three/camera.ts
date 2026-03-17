import { PerspectiveCamera, Vector3 } from "three";
import { easeInOutCubic } from "./animations";

const INTRO_DURATION = 2800;
const IDLE_AMPLITUDE = 0.03;
const IDLE_SPEED = 0.0005;

const START_POS = new Vector3(4, 12, 10);
const END_POS = new Vector3(0, 5, 7);
const START_LOOK = new Vector3(0, 2, 0);
const END_LOOK = new Vector3(0, 0.5, 0);

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

/** Returns true if the camera actually moved enough to warrant a re-render */
export function idleFloat(camera: PerspectiveCamera, time: number): boolean {
	const newY = END_POS.y + Math.sin(time * IDLE_SPEED) * IDLE_AMPLITUDE;
	if (Math.abs(newY - lastIdleY) < 0.0005) return false;
	lastIdleY = newY;
	camera.position.y = newY;
	camera.lookAt(END_LOOK);
	return true;
}
