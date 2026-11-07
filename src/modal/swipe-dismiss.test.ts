// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mountSwipeDismiss } from "./swipe-dismiss";

let surface: HTMLElement;
let panel: HTMLElement;
let backdrop: HTMLElement;
let onDismiss: ReturnType<typeof vi.fn<() => void>>;
let unmount: () => void;
let now = 0;

function touch(type: string, y: number, x = 100): void {
	const e = new Event(type, { bubbles: true, cancelable: true });
	const point = { identifier: 1, clientX: x, clientY: y };
	Object.defineProperty(e, "touches", { value: type === "touchend" ? [] : [point] });
	Object.defineProperty(e, "changedTouches", { value: [point] });
	surface.dispatchEvent(e);
}

function drag(from: number, to: number, ms: number): void {
	touch("touchstart", from);
	const steps = 5;
	for (let i = 1; i <= steps; i++) {
		now += ms / steps;
		touch("touchmove", from + ((to - from) * i) / steps);
	}
	touch("touchend", to);
}

beforeEach(() => {
	document.body.innerHTML = `<div id="b"></div><div id="p"><div id="s"></div></div>`;
	surface = document.getElementById("s") as HTMLElement;
	panel = document.getElementById("p") as HTMLElement;
	backdrop = document.getElementById("b") as HTMLElement;
	onDismiss = vi.fn<() => void>();
	now = 0;
	vi.spyOn(performance, "now").mockImplementation(() => now);
	unmount = mountSwipeDismiss({
		surfaceEl: surface,
		panelEl: panel,
		backdropEl: backdrop,
		isOpen: () => true,
		onDismiss,
	});
});

afterEach(() => {
	unmount();
	vi.restoreAllMocks();
});

it("dismisses after a long downward drag from the top", () => {
	drag(100, 300, 600);
	expect(onDismiss).toHaveBeenCalledTimes(1);
});

it("dismisses after a short fast flick", () => {
	drag(100, 160, 60);
	expect(onDismiss).toHaveBeenCalledTimes(1);
});

it("springs back after a short slow drag", () => {
	drag(100, 160, 600);
	expect(onDismiss).not.toHaveBeenCalled();
	expect(panel.style.translate).toBe("");
});

it("ignores upward drags", () => {
	drag(300, 50, 200);
	expect(onDismiss).not.toHaveBeenCalled();
});

it("leaves scrolling alone when the content is not at the top", () => {
	Object.defineProperty(surface, "scrollHeight", { value: 2000 });
	Object.defineProperty(surface, "clientHeight", { value: 800 });
	surface.scrollTop = 200;
	drag(100, 400, 300);
	expect(onDismiss).not.toHaveBeenCalled();
});
