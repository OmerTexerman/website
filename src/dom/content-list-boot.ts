import { mountContentList } from "./content-list";

const container = document.querySelector<HTMLElement>("[data-content-list]");
if (container) {
	const searchInput = document.querySelector<HTMLInputElement>("[data-content-search]");
	const showMoreButton = document.querySelector<HTMLElement>("[data-show-more]");
	const noResultsEl = document.querySelector<HTMLElement>("[data-content-no-results]");
	const pageSize = Number(container.dataset.pageSize) || undefined;
	const groupSelector = container.dataset.groupSelector || undefined;
	const itemSelector = container.dataset.itemSelector || undefined;

	const cleanup = mountContentList({
		container,
		searchInput,
		showMoreButton,
		noResultsEl,
		pageSize,
		groupSelector,
		...(itemSelector ? { itemSelector } : {}),
	});

	document.addEventListener("astro:before-preparation", cleanup, {
		once: true,
	});
	window.addEventListener("pagehide", cleanup, { once: true });
}
