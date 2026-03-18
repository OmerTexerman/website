/** Y position at the desk surface — used by all objects that sit on the desk. */
export const DESK_SURFACE_Y = 0.12;

export function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}
