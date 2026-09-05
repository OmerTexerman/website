import { afterEach, expect, it, vi } from "vitest";
import { trackEvent } from "./analytics";

afterEach(() => {
	delete window.va;
});

it.each([
	["desk_object_click", { label: "Photos", href: "/photos" }],
	["shelf_decor_tap", { label: "Spotlight" }],
	["shelf_item_tap", { label: "Reading", href: "/reading" }],
] as const)("preserves %s properties in Vercel's event data", (event, props) => {
	const queue = vi.fn();
	window.va = queue;

	trackEvent(event, props);

	expect(queue).toHaveBeenCalledExactlyOnceWith("event", { name: event, data: props });
});

it("does not interrupt a scene interaction when analytics is unavailable", () => {
	delete window.va;

	expect(() => trackEvent("desk_object_click", { label: "Photos", href: "/photos" })).not.toThrow();
});
