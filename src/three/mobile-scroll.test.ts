import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMobileScrollController, type MobileScrollController } from "./mobile-scroll";

const STOPS = [0, 1 / 3, 2 / 3, 1] as const;
const HOME = STOPS[2];
const ROW = 1 / 3;
const FRAME_MS = 16;

let now = 0;
let scroll: MobileScrollController;

function fakeCanvas(): HTMLCanvasElement {
	return {
		setPointerCapture: () => {},
		releasePointerCapture: () => {},
		hasPointerCapture: () => false,
	} as unknown as HTMLCanvasElement;
}

function pointer(clientY: number, clientX = 100): PointerEvent {
	return { pointerId: 1, button: 0, clientX, clientY } as unknown as PointerEvent;
}

function wheel(deltaY: number, deltaX = 0): WheelEvent {
	return {
		deltaX,
		deltaY,
		deltaMode: 0,
		timeStamp: now,
		preventDefault: () => {},
	} as unknown as WheelEvent;
}

/** One frame: time passes, then the controller ticks. */
function frame(): void {
	now += FRAME_MS;
	vi.advanceTimersByTime(FRAME_MS);
	scroll.tick(FRAME_MS / 1000);
}

function settle(): void {
	for (let i = 0; i < 90; i++) frame();
}

/** Drag a finger from y=500 by `dy` px over `ms`, then lift it. */
function drag(dy: number, ms: number, lift = true): void {
	scroll.onPointerDown(pointer(500));
	const steps = Math.max(1, Math.round(ms / FRAME_MS));
	for (let i = 1; i <= steps; i++) {
		now += FRAME_MS;
		scroll.onPointerMove(pointer(500 + (dy * i) / steps));
	}
	if (lift) scroll.onPointerUp(pointer(500 + dy));
}

type Delta = number | [dy: number, dx: number];

/** Trackpad events, one per frame. */
function swipe(deltas: readonly Delta[]): void {
	for (const d of deltas) {
		const [dy, dx] = typeof d === "number" ? [d, 0] : d;
		now += FRAME_MS;
		vi.advanceTimersByTime(FRAME_MS);
		scroll.onWheel(wheel(dy, dx));
		scroll.tick(FRAME_MS / 1000);
	}
}

/** A trackpad swipe: steady finger deltas, then a fading momentum tail. */
function flick(perEvent: number, fingerEvents: number, decay = 0.92): number[] {
	const fingers = Array.from({ length: fingerEvents }, () => perEvent);
	const tail: number[] = [];
	for (let d = perEvent * decay; Math.abs(d) > 0.3; d *= decay) tail.push(d);
	return [...fingers, ...tail];
}

const sideways = (deltas: number[]): Delta[] => deltas.map((d) => [0, d]);

/** The part of a flick up to where its momentum has faded. */
const faded = (deltas: number[]): number[] =>
	deltas.slice(0, deltas.findIndex((d) => Math.abs(d) < 1.5) + 1);

beforeEach(() => {
	now = 0;
	vi.useFakeTimers();
	vi.spyOn(performance, "now").mockImplementation(() => now);
	scroll = createMobileScrollController(fakeCanvas(), {
		verticalStops: STOPS,
		panSnapPoints: [[0], [-0.65, 0.35], [-0.78, 0.3], [0]],
		panLimit: 1,
		numRows: STOPS.length,
	});
	scroll.resetTo(HOME);
});

describe("touch", () => {
	it("follows the finger 1:1, a shelf per 340px", () => {
		drag(170, 1000, false); // finger down: the view moves down the shelves
		expect(scroll.verticalT).toBeCloseTo(HOME - ROW / 2, 4);
	});

	it("locks on: one slow gesture can't drag past the next shelf", () => {
		drag(700, 3000, false);
		expect(scroll.verticalT).toBeCloseTo(STOPS[1], 4);
		scroll.onPointerUp(pointer(1200));
		settle();
		expect(scroll.verticalT).toBeCloseTo(STOPS[1], 4);
	});

	it("springs back from a short, slow drag", () => {
		drag(60, 800);
		settle();
		expect(scroll.verticalT).toBeCloseTo(HOME, 4);
	});

	it("moves on from a short flick, carrying its speed", () => {
		drag(70, 100);
		const released = scroll.verticalT;
		frame();
		expect(scroll.verticalT).toBeLessThan(released); // keeps going, no jolt back
		settle();
		expect(scroll.verticalT).toBeCloseTo(STOPS[1], 4);
	});

	it("can cover two shelves, but only with a fast, long drag", () => {
		drag(600, 200);
		settle();
		expect(scroll.verticalT).toBeCloseTo(STOPS[0], 4);
	});

	it("treats a still touch as a tap", () => {
		scroll.onPointerDown(pointer(500));
		scroll.onPointerUp(pointer(504));
		expect(scroll.consumeTap()).toEqual({ clientX: 100, clientY: 504 });
	});
});

describe("trackpad", () => {
	it("follows the fingers 1:1, a shelf per 550px", () => {
		swipe(Array.from({ length: 11 }, () => 12.5));
		expect(scroll.verticalT).toBeCloseTo(HOME - ROW / 4, 4);
	});

	it("moves one shelf per ordinary swipe, bouncing only slightly past it", () => {
		for (const d of flick(25, 10)) {
			swipe([d]);
			expect(scroll.verticalT).toBeGreaterThanOrEqual(STOPS[1] - ROW * 0.1);
		}
		settle();
		expect(scroll.verticalT).toBeCloseTo(STOPS[1], 4);
	});

	it("lets go as soon as the momentum starts, ignoring the rest", () => {
		// A short, quick swipe: 100px of fingers, so 1:1 alone wouldn't reach
		// the next shelf; the projection from its speed does.
		const deltas = flick(25, 4);
		swipe(deltas.slice(0, 4 + 12)); // fingers, then the start of the momentum
		for (let i = 0; i < 25; i++) frame();
		expect(scroll.verticalT).toBeCloseTo(STOPS[1], 3);
		// The rest of the momentum changes nothing.
		swipe(deltas.slice(4 + 12));
		settle();
		expect(scroll.verticalT).toBeCloseTo(STOPS[1], 4);
	});

	it("treats Chrome's finger-up event as the fingers lifting", () => {
		swipe([14, 18, 22, 22, 22, 22]);
		// Chrome on Windows sends a zero delta with deltaX = -0 on lift.
		swipe([[0, -0], 20, 18, 16, 14, 12, 10]);
		settle();
		expect(scroll.verticalT).toBeCloseTo(STOPS[1], 4);
	});

	it("can cover two shelves with a hard, long flick", () => {
		swipe(flick(70, 8, 0.95));
		settle();
		expect(scroll.verticalT).toBeCloseTo(STOPS[0], 4);
	});

	it("springs back from a small nudge", () => {
		swipe([3.5, 4.5, 4.5, 3.5, 2, 1]);
		settle();
		expect(scroll.verticalT).toBeCloseTo(HOME, 4);
	});

	it("moves on from a quick, short swipe", () => {
		swipe(flick(25, 5, 0.8));
		settle();
		expect(scroll.verticalT).toBeCloseTo(STOPS[1], 4);
	});

	it("reads a crooked vertical swipe as vertical", () => {
		swipe([[1, 4], [3, 3], ...flick(20, 8).map((d): Delta => [d, 1])]);
		settle();
		expect(scroll.verticalT).toBeCloseTo(STOPS[1], 4);
		expect(scroll.panByRow[2]).toBe(0);
	});

	it("flips sideways to the next item, bouncing only slightly past it", () => {
		// The home shelf's items sit at -0.78 and 0.3.
		for (const d of sideways(flick(15, 8))) {
			swipe([d]);
			expect(scroll.panByRow[2]).toBeGreaterThanOrEqual(-0.78 - 0.1);
		}
		settle();
		expect(scroll.panByRow[2]).toBeCloseTo(-0.78, 4);
		expect(scroll.verticalT).toBeCloseTo(HOME, 4);
	});

	it("turns straight round when a swipe reverses mid-momentum", () => {
		swipe(sideways(flick(15, 8).slice(0, 14)));
		const turnedAt = scroll.panByRow[2];
		swipe([[0, -6]]);
		expect(scroll.panByRow[2]).toBeGreaterThan(turnedAt);
		swipe(sideways(flick(-15, 8)));
		settle();
		expect(scroll.panByRow[2]).toBeCloseTo(0.3, 4);
	});

	it("chains a second swipe on from where the first is heading", () => {
		swipe(faded(flick(20, 6)));
		frame();
		swipe(flick(20, 6));
		settle();
		expect(scroll.verticalT).toBeCloseTo(STOPS[0], 4);
	});

	it("finishes a shelf change when a sideways swipe interrupts it", () => {
		swipe(faded(flick(20, 6)));
		frame();
		// The view is heading to the shelf below, so that's the shelf that pans.
		swipe(sideways(flick(15, 8)));
		settle();
		expect(scroll.verticalT).toBeCloseTo(STOPS[1], 4);
		expect(scroll.panByRow[1]).toBeCloseTo(-0.65, 4);
	});

	it("bounces off the end of a row instead of holding there", () => {
		swipe(sideways(flick(15, 8)));
		settle();
		expect(scroll.panByRow[2]).toBeCloseTo(-0.78, 4);
		// Swipe on past the leftmost item, momentum and all.
		let furthest = 0;
		let backAt = -1;
		const deltas = sideways(flick(15, 8));
		for (let i = 0; i < deltas.length + 40; i++) {
			if (i < deltas.length) swipe([deltas[i]]);
			else frame();
			const over = -0.78 - scroll.panByRow[2];
			furthest = Math.max(furthest, over);
			if (backAt < 0 && i > 3 && Math.abs(over) < 0.005) backAt = i;
		}
		expect(furthest).toBeGreaterThan(0); // it does give a little
		expect(furthest).toBeLessThan(0.16);
		// Back on the item within ~0.35 s, mid-momentum, not after it.
		expect(backAt).toBeGreaterThan(0);
		expect(backAt * FRAME_MS).toBeLessThan(350);
	});

	it("springs back promptly from a touch pulled past the end", () => {
		scroll.resetTo(STOPS[3]);
		drag(-200, 300); // pull past the top shelf, then let go
		let frames = 0;
		while (Math.abs(scroll.verticalT - STOPS[3]) > 0.002 && frames < 100) {
			frame();
			frames++;
		}
		expect(frames * FRAME_MS).toBeLessThan(350);
	});

	it("ignores sideways swipes on a shelf with nothing beside it", () => {
		scroll.resetTo(STOPS[3]);
		swipe(sideways(flick(15, 8)));
		settle();
		expect(scroll.verticalT).toBeCloseTo(STOPS[3], 4);
		expect(scroll.panByRow[3]).toBe(0);
	});
});

describe("mouse wheel", () => {
	it("steps one item per notch", () => {
		// Home shelf: items at -0.78 and 0.3; pan 0 rests nearest 0.3.
		scroll.onWheel(wheel(100));
		settle();
		expect(scroll.verticalT).toBeCloseTo(HOME, 4);
		expect(scroll.panByRow[2]).toBeCloseTo(-0.78, 4);
	});
});
