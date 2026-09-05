// @vitest-environment happy-dom

import { afterEach, beforeEach, expect, it, vi } from "vitest";

function visibleEntries(): string[] {
	return [...document.querySelectorAll(".entry:not([data-content-hidden])")].map(
		(entry) => entry.textContent ?? "",
	);
}

function search(query: string): void {
	const input = document.querySelector<HTMLInputElement>("[data-content-search]");
	if (!input) throw new Error("Missing search input");
	input.value = query;
	input.dispatchEvent(new Event("input", { bubbles: true }));
	vi.advanceTimersByTime(200);
}

function pageTransition(type: "pagehide" | "pageshow", persisted: boolean): void {
	const event = new PageTransitionEvent(type);
	// Happy DOM does not initialize PageTransitionEvent.persisted from constructor options.
	Object.defineProperty(event, "persisted", { value: persisted });
	window.dispatchEvent(event);
}

function restoreFromCache(): void {
	pageTransition("pagehide", true);
	pageTransition("pageshow", true);
}

beforeEach(async () => {
	vi.useFakeTimers();
	vi.resetModules();
	document.body.innerHTML = `
		<style>.content-no-results { display: none; }</style>
		<input data-content-search aria-label="Search books">
		<div data-content-list data-item-selector=".entry" data-page-size="2">
			<div class="entry">The Peregrine</div>
			<div class="entry">Dostoevsky: Notes from Underground</div>
			<div class="entry">On Trails</div>
			<div class="entry">Dostoevsky: The Idiot</div>
			<div class="entry">On Love</div>
			<div class="entry">I Am a Strange Loop</div>
			<div class="entry">The Algebra of Happiness</div>
			<div class="entry">A History of Western Philosophy</div>
		</div>
		<button data-show-more>Show more</button>
		<p class="content-no-results" data-content-no-results>No matching entries.</p>
	`;
	await import("./content-list-boot");
});

afterEach(() => {
	document.dispatchEvent(new Event("astro:before-preparation"));
	vi.useRealTimers();
	document.body.replaceChildren();
});

it("preserves a filtered list after browser Back and continues responding to input", () => {
	search("Dostoevsky");
	const matches = visibleEntries();
	expect(matches).toHaveLength(2);

	restoreFromCache();
	expect(visibleEntries()).toEqual(matches);

	search("not a book");
	expect(visibleEntries()).toEqual([]);
	const emptyState = document.querySelector<HTMLElement>("[data-content-no-results]");
	if (!emptyState) throw new Error("Missing empty state");
	expect(getComputedStyle(emptyState).display).not.toBe("none");

	search("");
	expect(visibleEntries()).toHaveLength(2);
});

it("preserves expanded pagination through repeated cache restores without duplicate handlers", () => {
	const showMore = document.querySelector<HTMLButtonElement>("[data-show-more]");
	showMore?.click();
	expect(visibleEntries()).toHaveLength(4);

	restoreFromCache();
	restoreFromCache();
	expect(visibleEntries()).toHaveLength(4);

	showMore?.click();
	expect(visibleEntries()).toHaveLength(6);
});

it("still removes handlers when permanently leaving the page", () => {
	restoreFromCache();
	pageTransition("pagehide", false);
	search("not a book");
	expect(visibleEntries()).toHaveLength(8);
});
