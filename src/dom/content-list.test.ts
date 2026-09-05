import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountContentList } from "./content-list";

const DEBOUNCE_MS = 150;

interface Harness {
	container: HTMLElement;
	items: HTMLElement[];
	searchInput: HTMLInputElement;
	showMoreButton: HTMLButtonElement;
	noResultsEl: HTMLElement;
}

function build(labels: string[]): Harness {
	document.body.innerHTML = `
		<style>.content-no-results { display: none; }</style>
		<input type="search" data-content-search />
		<div data-content-list>
			${labels.map((l) => `<div data-animate><span>${l}</span></div>`).join("")}
		</div>
		<p class="content-no-results" data-content-no-results></p>
		<button data-show-more>Show more</button>
	`;
	const container = document.querySelector<HTMLElement>("[data-content-list]");
	const searchInput = document.querySelector<HTMLInputElement>("[data-content-search]");
	const showMoreButton = document.querySelector<HTMLButtonElement>("[data-show-more]");
	const noResultsEl = document.querySelector<HTMLElement>("[data-content-no-results]");
	if (!container || !searchInput || !showMoreButton || !noResultsEl) throw new Error("bad harness");

	return {
		container,
		items: [...container.querySelectorAll<HTMLElement>("[data-animate]")],
		searchInput,
		showMoreButton,
		noResultsEl,
	};
}

const visible = (items: HTMLElement[]) => items.filter((el) => el.style.display !== "none").length;

function type(h: Harness, value: string): void {
	h.searchInput.value = value;
	h.searchInput.dispatchEvent(new Event("input"));
	vi.advanceTimersByTime(DEBOUNCE_MS);
}

beforeEach(() => {
	vi.useFakeTimers();
});

describe("pagination", () => {
	it("shows only the first page and hides the rest", () => {
		const h = build(["a", "b", "c", "d", "e", "f", "g"]);
		mountContentList({ ...h, pageSize: 3 });

		expect(visible(h.items)).toBe(3);
		expect(h.items[3].getAttribute("data-content-hidden")).toBe("");
	});

	it("reveals another page per click and then hides the button", () => {
		const h = build(["a", "b", "c", "d", "e"]);
		mountContentList({ ...h, pageSize: 2 });
		expect(h.showMoreButton.textContent).toBe("Show more (3 remaining)");

		h.showMoreButton.click();
		expect(visible(h.items)).toBe(4);

		h.showMoreButton.click();
		expect(visible(h.items)).toBe(5);
		expect(h.showMoreButton.style.display).toBe("none");
	});

	it("hides the button outright when everything already fits", () => {
		const h = build(["a", "b"]);
		mountContentList({ ...h, pageSize: 5 });
		expect(h.showMoreButton.style.display).toBe("none");
	});

	it("does nothing when the container has no items", () => {
		const h = build([]);
		const cleanup = mountContentList({ ...h, pageSize: 3 });
		expect(cleanup).toBeTypeOf("function");
		expect(() => cleanup()).not.toThrow();
	});
});

describe("search", () => {
	it("shows every match regardless of the page size", () => {
		const h = build(["alpha", "beta", "gamma", "alpaca", "delta"]);
		mountContentList({ ...h, pageSize: 2 });

		type(h, "alp");
		// "alpha" and "alpaca" both match, including the one past page one.
		expect(visible(h.items)).toBe(2);
		expect(h.items[3].style.display).not.toBe("none");
	});

	it("matches case-insensitively", () => {
		const h = build(["Alpha", "beta"]);
		mountContentList({ ...h, pageSize: 5 });
		type(h, "ALPHA");
		expect(visible(h.items)).toBe(1);
	});

	it("surfaces the empty state and hides the show-more button", () => {
		const h = build(["alpha", "beta", "gamma"]);
		mountContentList({ ...h, pageSize: 2 });

		type(h, "zzz");
		expect(visible(h.items)).toBe(0);
		expect(getComputedStyle(h.noResultsEl).display).not.toBe("none");
		expect(h.showMoreButton.style.display).toBe("none");
	});

	it("restores pagination when the query is cleared", () => {
		const h = build(["alpha", "beta", "gamma", "delta"]);
		mountContentList({ ...h, pageSize: 2 });

		type(h, "zzz");
		type(h, "");

		expect(visible(h.items)).toBe(2);
		expect(h.noResultsEl.style.display).toBe("none");
		expect(h.showMoreButton.style.display).toBe("");
	});

	it("debounces rapid typing into a single pass", () => {
		const h = build(["alpha", "beta", "gamma"]);
		mountContentList({ ...h, pageSize: 5 });

		for (const q of ["a", "al", "alp", "alph", "alpha"]) {
			h.searchInput.value = q;
			h.searchInput.dispatchEvent(new Event("input"));
			vi.advanceTimersByTime(20);
		}
		// Nothing has been applied yet — the debounce window never elapsed.
		expect(visible(h.items)).toBe(3);

		vi.advanceTimersByTime(DEBOUNCE_MS);
		expect(visible(h.items)).toBe(1);
	});

	it("hides the search box when there are too few items to be worth filtering", () => {
		const h = build(["alpha", "beta"]);
		mountContentList({ ...h, pageSize: 5 });
		expect(h.searchInput.style.display).toBe("none");
	});
});

describe("groups", () => {
	function buildGrouped(): Harness & { groups: HTMLElement[] } {
		document.body.innerHTML = `
			<input type="search" data-content-search />
			<div data-content-list>
				<section class="grp"><div data-animate><span>alpha</span></div></section>
				<section class="grp"><div data-animate><span>beta</span></div></section>
			</div>
			<p data-content-no-results></p>
			<button data-show-more></button>
		`;
		const container = document.querySelector<HTMLElement>("[data-content-list]");
		if (!container) throw new Error("bad harness");
		return {
			container,
			items: [...container.querySelectorAll<HTMLElement>("[data-animate]")],
			// biome-ignore lint/style/noNonNullAssertion: fixed harness markup
			searchInput: document.querySelector<HTMLInputElement>("[data-content-search]")!,
			// biome-ignore lint/style/noNonNullAssertion: fixed harness markup
			showMoreButton: document.querySelector<HTMLButtonElement>("[data-show-more]")!,
			// biome-ignore lint/style/noNonNullAssertion: fixed harness markup
			noResultsEl: document.querySelector<HTMLElement>("[data-content-no-results]")!,
			groups: [...container.querySelectorAll<HTMLElement>(".grp")],
		};
	}

	it("collapses a group once all of its items are filtered out", () => {
		const h = buildGrouped();
		mountContentList({
			...h,
			pageSize: 999,
			groupSelector: ".grp",
			itemSelector: "[data-animate]",
		});

		type(h, "alpha");
		expect(h.groups[0].style.display).toBe("");
		expect(h.groups[1].style.display).toBe("none");
	});
});

describe("cleanup", () => {
	it("restores every item and detaches its listeners", () => {
		const h = build(["alpha", "beta", "gamma", "delta"]);
		const cleanup = mountContentList({ ...h, pageSize: 2 });
		expect(visible(h.items)).toBe(2);

		cleanup();
		expect(visible(h.items)).toBe(4);

		// A late input event must not re-apply filtering after teardown.
		type(h, "zzz");
		expect(visible(h.items)).toBe(4);
	});
});
