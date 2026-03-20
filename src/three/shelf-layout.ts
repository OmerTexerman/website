import { Vector3 } from "three";
import { MOBILE_INTRO_START_POS, MOBILE_LOOK, MOBILE_POS } from "./camera";

export const SHELF_WALL_X = 8.95;
export const SHELF_WALL_Z = 4.4;
export const SHELF_TOP_Y = 3.6;
export const SHELF_MID_Y = 2.2;
export const SHELF_BOT_Y = 0.8;

export const MOBILE_SHELF_STOPS = [
	{ cameraY: 1.25, lookY: 0.95 },
	{ cameraY: MOBILE_POS.y, lookY: MOBILE_LOOK.y },
	{ cameraY: 4.02, lookY: 3.72 },
] as const;

export const MOBILE_SHELF_SCROLL = {
	verticalStops: [0, 0.5, 1] as const,
	panSnapPoints: [[0], [-0.78, 0.3], [-0.65, 0.45]] as const,
	panLimit: 1,
} as const;

export const MOBILE_TRANSITION_MID_POS = MOBILE_INTRO_START_POS.clone();
export const MOBILE_TRANSITION_MID_LOOK = new Vector3(8.1, 2.2, 4.7);
