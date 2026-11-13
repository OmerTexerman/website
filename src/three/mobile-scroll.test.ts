import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMobileScrollController, type MobileScrollController } from "./mobile-scroll";

const STOPS = [0, 1 / 3, 2 / 3, 1] as const;
const HOME = STOPS[2];
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

function pointer(clientY: number): PointerEvent {
	return { pointerId: 1, button: 0, clientX: 100, clientY } as unknown as PointerEvent;
}

function wheel(deltaY: number, deltaX = 0): WheelEvent {
	return {
		deltaX,
		deltaY,
		deltaMode: 0,
		preventDefault: () => {},
	} as unknown as WheelEvent;
}

/** Advance time one frame, ticking the controller. */
function frame(): void {
	now += FRAME_MS;
	scroll.tick(FRAME_MS / 1000);
}

function settle(): void {
	vi.advanceTimersByTime(500);
	for (let i = 0; i < 120; i++) frame();
}

/** Drag a finger from y=500 by `dy` px over `ms`, then lift it. */
function drag(dy: number, ms: number): void {
	scroll.onPointerDown(pointer(500));
	const steps = Math.max(1, Math.round(ms / FRAME_MS));
	for (let i = 1; i <= steps; i++) {
		now += FRAME_MS;
		scroll.onPointerMove(pointer(500 + (dy * i) / steps));
	}
	scroll.onPointerUp(pointer(500 + dy));
}

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

describe("touch dragging", () => {
	it("moves one row per ~260px of finger travel, whatever the stop count", () => {
		scroll.onPointerDown(pointer(500));
		for (let y = 490; y >= 370; y -= 10) {
			now += FRAME_MS;
			scroll.onPointerMove(pointer(y));
		}
		// 130px of travel (after the 8px direction lock) is about half a row.
		const rows = (scroll.verticalT - HOME) / (1 / 3);
		expect(rows).toBeGreaterThan(0.4);
		expect(rows).toBeLessThan(0.55);
	});

	it("springs back from a short, slow drag", () => {
		drag(-60, 600);
		settle();
		expect(scroll.verticalT).toBeCloseTo(HOME, 4);
	});

	it("carries the finger's speed into the glide instead of jolting", () => {
		drag(-80, 120); // a quick flick upward
		const released = scroll.verticalT;
		frame();
		const firstStep = scroll.verticalT - released;
		// Keeps moving the same way, at roughly the finger's speed
		// (80px / 120ms ≈ 0.0034 per frame after the speed cap).
		expect(firstStep).toBeGreaterThan(0.002);
		settle();
		expect(scroll.verticalT).toBeCloseTo(STOPS[3], 4);
	});
});

describe("trackpad", () => {
	function swipe(deltas: number[]): void {
		for (const d of deltas) {
			now += FRAME_MS;
			vi.advanceTimersByTime(FRAME_MS);
			scroll.onWheel(wheel(d));
			scroll.tick(FRAME_MS / 1000);
		}
	}

	it("keeps following a slow swipe whose deltas wobble", () => {
		// Fingers moving unevenly: several shrinking deltas in a row, but
		// nowhere near momentum. This used to snap the shelf mid-swipe.
		swipe([-6, -8, -7.5, -7, -6.5, -6, -7.5, -8, -7, -6.5, -6]);
		const total = 6 + 8 + 7.5 + 7 + 6.5 + 6 + 7.5 + 8 + 7 + 6.5 + 6;
		expect(scroll.verticalT).toBeCloseTo(HOME + total / 400 / 3, 4);
	});

	it("snaps to the next row once momentum starts, without reversing", () => {
		const fingers = Array.from({ length: 10 }, () => 12.5);
		const momentum = Array.from({ length: 30 }, (_, i) => 12.5 * 0.9 ** (i + 1));
		swipe([...fingers, ...momentum.slice(0, 6)]);
		const before = scroll.verticalT;
		frame();
		expect(scroll.verticalT).toBeLessThan(before);
		swipe(momentum.slice(6));
		settle();
		expect(scroll.verticalT).toBeCloseTo(STOPS[1], 4);
	});

	it("springs back from a small nudge", () => {
		swipe([3.5, 4.5, 4.5, 3.5]);
		settle();
		expect(scroll.verticalT).toBeCloseTo(HOME, 4);
	});

	it("flips sideways to the next item quickly, ignoring the momentum", () => {
		// Home row's items sit at -0.78 and 0.3; it starts on 0.3.
		const fingers = [6, 9, 12, 12];
		const momentum = Array.from({ length: 40 }, (_, i) => 12 * 0.93 ** (i + 1));
		for (const dx of [...fingers, ...momentum]) {
			now += FRAME_MS;
			vi.advanceTimersByTime(FRAME_MS);
			scroll.onWheel(wheel(0, dx));
			scroll.tick(FRAME_MS / 1000);
			// Never sails past the item it's heading for.
			expect(scroll.panByRow[2]).toBeGreaterThanOrEqual(-0.78 - 0.001);
		}
		// Arrived well before the momentum ran out.
		expect(scroll.panByRow[2]).toBeCloseTo(-0.78, 2);
		settle();
		expect(scroll.panByRow[2]).toBeCloseTo(-0.78, 4);
		expect(scroll.verticalT).toBeCloseTo(HOME, 4);
	});
});
