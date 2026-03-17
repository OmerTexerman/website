import { PerspectiveCamera, Vector3 } from "three";

const INTRO_DURATION = 2800;
const IDLE_AMPLITUDE = 0.03;
const IDLE_SPEED = 0.0005;

// Camera sweeps from high/far to the final desk-viewing angle
const START_POS = new Vector3(4, 12, 10);
const END_POS = new Vector3(0, 5, 7);
const START_LOOK = new Vector3(0, 2, 0);
const END_LOOK = new Vector3(0, 0.5, 0);

export function createCamera(aspect: number): PerspectiveCamera {
	const camera = new PerspectiveCamera(45, aspect, 0.1, 100);
	camera.position.copy(START_POS);
	camera.lookAt(START_LOOK);
	return camera;
}

function easeInOutCubic(t: number): number {
	return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

const _lookTarget = new Vector3();

export function animateIntro(camera: PerspectiveCamera, startTime: number, now: number): boolean {
	const elapsed = now - startTime;
	const progress = Math.min(elapsed / INTRO_DURATION, 1);
	const eased = easeInOutCubic(progress);

	// Interpolate position
	camera.position.lerpVectors(START_POS, END_POS, eased);

	// Interpolate look-at target
	_lookTarget.lerpVectors(START_LOOK, END_LOOK, eased);
	camera.lookAt(_lookTarget);

	return progress >= 1;
}

export function idleFloat(camera: PerspectiveCamera, time: number): void {
	const offset = Math.sin(time * IDLE_SPEED) * IDLE_AMPLITUDE;
	camera.position.y = END_POS.y + offset;
	camera.lookAt(END_LOOK);
}
