import { setRevealPending, showRevealed } from "./reveal";

export interface ContentListOptions {
	/** The container holding all items. */
	container: HTMLElement;
	/** CSS selector to find individual items within the container. */
	itemSelector?: string;
	/** Number of items to show per page. */
	pageSize?: number;
	/** The search input element. */
	searchInput?: HTMLInputElement | null;
	/** The "show more" button element. */
	showMoreButton?: HTMLElement | null;
	/** Optional "no results" element to show when search yields nothing. */
	noResultsEl?: HTMLElement | null;
	/** CSS selector for group containers (e.g., ".reading-section").
	 *  When set, groups whose items are all hidden will be hidden too. */
	groupSelector?: string;
}

const DEBOUNCE_MS = 150;
const MIN_ITEMS_FOR_SEARCH = 3;

export function mountContentList(options: ContentListOptions): () => void {
	const {
		container,
		itemSelector = ":scope > [data-animate]",
		pageSize = 5,
		searchInput = null,
		showMoreButton = null,
		noResultsEl = null,
		groupSelector = undefined,
	} = options;

	const allItems = [...container.querySelectorAll<HTMLElement>(itemSelector)];
	if (allItems.length === 0) return () => {};

	let visibleCount = Math.min(pageSize, allItems.length);
	let searching = false;
	let debounceTimer = 0;

	// Hide search if too few items
	if (searchInput && allItems.length < MIN_ITEMS_FOR_SEARCH) {
		searchInput.style.display = "none";
	}

	function hideItem(el: HTMLElement): void {
		el.setAttribute("data-content-hidden", "");
		el.style.display = "none";
	}

	function showItem(el: HTMLElement): void {
		el.removeAttribute("data-content-hidden");
		el.style.display = "";
	}

	function revealItem(el: HTMLElement): void {
		showItem(el);
		if (el.hasAttribute("data-animate")) {
			setRevealPending(el);
			// Force reflow so the animation triggers
			void el.offsetHeight;
			showRevealed(el);
		}
	}

	function updateButton(): void {
		if (!showMoreButton) return;
		const remaining = allItems.length - visibleCount;
		if (remaining <= 0 || searching) {
			showMoreButton.style.display = "none";
		} else {
			showMoreButton.style.display = "";
			showMoreButton.textContent = `Show more (${remaining} remaining)`;
		}
	}

	/** Show/hide group containers based on whether they contain any visible items. */
	function updateGroups(): void {
		if (!groupSelector) return;
		const groups = container.querySelectorAll<HTMLElement>(groupSelector);
		for (const group of groups) {
			const hasVisible = group.querySelector(`${itemSelector}:not([data-content-hidden])`);
			group.style.display = hasVisible ? "" : "none";
		}
	}

	function applyPagination(): void {
		for (let i = 0; i < allItems.length; i++) {
			if (i < visibleCount) {
				showItem(allItems[i]);
			} else {
				hideItem(allItems[i]);
			}
		}
		updateButton();
		updateGroups();
		if (noResultsEl) noResultsEl.style.display = "none";
	}

	function handleShowMore(): void {
		const prevCount = visibleCount;
		visibleCount = Math.min(visibleCount + pageSize, allItems.length);
		for (let i = prevCount; i < visibleCount; i++) {
			revealItem(allItems[i]);
		}
		updateButton();
	}

	function handleSearch(): void {
		const query = searchInput?.value.trim().toLowerCase() ?? "";
		if (!query) {
			searching = false;
			applyPagination();
			return;
		}

		searching = true;
		let matchCount = 0;
		for (const item of allItems) {
			const text = item.textContent?.toLowerCase() ?? "";
			if (text.includes(query)) {
				showItem(item);
				matchCount++;
			} else {
				hideItem(item);
			}
		}

		updateButton();
		updateGroups();
		if (noResultsEl) {
			noResultsEl.style.display = matchCount === 0 ? "" : "none";
		}
	}

	function onSearchInput(): void {
		clearTimeout(debounceTimer);
		debounceTimer = window.setTimeout(handleSearch, DEBOUNCE_MS);
	}

	// Initial state
	applyPagination();

	// Wire events
	showMoreButton?.addEventListener("click", handleShowMore);
	searchInput?.addEventListener("input", onSearchInput);

	return () => {
		clearTimeout(debounceTimer);
		showMoreButton?.removeEventListener("click", handleShowMore);
		searchInput?.removeEventListener("input", onSearchInput);
		// Restore all items and groups to visible
		for (const item of allItems) showItem(item);
		if (groupSelector) {
			for (const g of container.querySelectorAll<HTMLElement>(groupSelector)) {
				g.style.display = "";
			}
		}
	};
}
