// @vitest-environment happy-dom

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ContentModalApi } from "./api";

interface PendingRequest {
	signal: AbortSignal;
	resolve: (response: Response) => void;
	reject: (reason: unknown) => void;
}

let modal: ContentModalApi;
let cleanup: () => void;
let root: HTMLElement;
let body: HTMLElement;
let trigger: HTMLButtonElement;
let requests: PendingRequest[];
let animationDescriptor: PropertyDescriptor | undefined;

beforeEach(async () => {
	vi.useFakeTimers();
	vi.resetModules();
	requests = [];
	vi.spyOn(window, "matchMedia").mockReturnValue({
		matches: true,
		media: "(prefers-reduced-motion: reduce)",
		onchange: null,
		addListener: vi.fn(),
		removeListener: vi.fn(),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn(),
	});
	animationDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "getAnimations");
	Object.defineProperty(HTMLElement.prototype, "getAnimations", {
		configurable: true,
		value: () => [],
	});
	vi.stubGlobal(
		"fetch",
		vi.fn((_url: string, init: RequestInit) => {
			const signal = init.signal;
			if (!signal) throw new Error("Expected an abortable preview request");
			// Controlled responses also let a test deliver a late result after cancellation.
			return new Promise<Response>((resolve, reject) => {
				requests.push({ signal, resolve, reject });
			});
		}),
	);
	document.body.innerHTML = `
		<button id="trigger">Open blog</button>
		<div id="content-modal">
			<div id="content-modal-backdrop"></div>
			<div id="content-modal-panel">
				<div id="content-modal-surface">
					<h2 id="content-modal-title"></h2>
					<button id="content-modal-close">Close</button>
					<div id="content-modal-body"></div>
					<a id="content-modal-link" href="/">View full page</a>
				</div>
			</div>
		</div>
	`;
	const rootEl = document.getElementById("content-modal");
	const bodyEl = document.getElementById("content-modal-body");
	const triggerEl = document.getElementById("trigger");
	if (!rootEl || !bodyEl || !(triggerEl instanceof HTMLButtonElement)) {
		throw new Error("Incomplete modal fixture");
	}
	root = rootEl;
	body = bodyEl;
	trigger = triggerEl;
	trigger.focus();
	const { mountContentModal } = await import("./controller");
	cleanup = mountContentModal(root);
	const { getContentModal } = await import("./api");
	const api = getContentModal();
	if (!api) throw new Error("Modal was not registered");
	modal = api;
});

afterEach(() => {
	cleanup?.();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.useRealTimers();
	if (animationDescriptor) {
		Object.defineProperty(HTMLElement.prototype, "getAnimations", animationDescriptor);
	} else {
		Reflect.deleteProperty(HTMLElement.prototype, "getAnimations");
	}
	document.body.replaceChildren();
});

async function open(label = "Blog", href = "/blog"): Promise<void> {
	modal.open(label, href);
	await vi.advanceTimersByTimeAsync(0);
}

function respond(request: PendingRequest, text: string): void {
	request.resolve(new Response(`<main><p>${text}</p></main>`, { status: 200 }));
}

it("announces preview loading", async () => {
	await open();
	expect(body.querySelector('[role="status"]')?.textContent).toContain("Loading preview");
});

it("replaces a timed-out spinner with a retry and preserves the full-page link", async () => {
	await open();
	const request = requests[0];
	request.signal.addEventListener("abort", () => request.reject(request.signal.reason));
	await vi.advanceTimersByTimeAsync(10_000);

	expect(body.textContent).toContain("Preview took too long to load.");
	expect(body.querySelector(".animate-spin")).toBeNull();
	expect(document.getElementById("content-modal-link")?.getAttribute("href")).toBe("/blog");
	const retry = body.querySelector("button");
	expect(retry?.textContent).toBe("Try again");
	retry?.focus();
	retry?.click();
	await vi.advanceTimersByTimeAsync(0);
	expect(requests).toHaveLength(2);
	respond(requests[1], "Loaded after retry");
	await vi.advanceTimersByTimeAsync(0);
	expect(body.textContent).toContain("Loaded after retry");

	modal.close();
	await vi.advanceTimersByTimeAsync(0);
	expect(document.activeElement).toBe(trigger);
});

it("allows retry after a network failure", async () => {
	await open();
	requests[0].reject(new TypeError("Network unavailable"));
	await vi.advanceTimersByTimeAsync(0);
	expect(body.querySelector('[role="status"]')?.textContent).toContain("Could not load preview.");
	expect(body.querySelector("button")?.textContent).toBe("Try again");
});

it("does not show a timeout error or reopen after deliberate close", async () => {
	await open();
	const request = requests[0];
	request.signal.addEventListener("abort", () => request.reject(request.signal.reason));
	modal.close();
	await vi.advanceTimersByTimeAsync(10_000);
	expect(request.signal.aborted).toBe(true);
	expect(root.getAttribute("aria-hidden")).toBe("true");
	expect(body.textContent).not.toContain("Preview took too long");
	expect(document.activeElement).toBe(trigger);
});

it("ignores an older response after a different section is opened", async () => {
	await open();
	await open("Reading", "/reading");
	expect(requests[0].signal.aborted).toBe(true);
	respond(requests[1], "Current reading preview");
	await vi.advanceTimersByTimeAsync(0);
	respond(requests[0], "Stale blog preview");
	await vi.advanceTimersByTimeAsync(0);
	expect(body.textContent).toContain("Current reading preview");
	expect(body.textContent).not.toContain("Stale blog preview");
});

it("ignores an in-flight response after cleanup", async () => {
	await open();
	cleanup();
	respond(requests[0], "Late preview");
	await vi.advanceTimersByTimeAsync(0);
	expect(root.getAttribute("aria-hidden")).toBe("true");
	expect(body.textContent).not.toContain("Late preview");
});
