import { getBackLabel } from "../config";
import { getSameOriginReferrer, toRelativeHref } from "../url-utils";

function isChildPath(parent: string, child: string): boolean {
	const normalizedParent = parent === "/" ? "/" : parent.replace(/\/$/, "");
	const normalizedChild = child.replace(/\/$/, "");
	if (normalizedParent === "/") return false;
	return normalizedChild.startsWith(`${normalizedParent}/`);
}

export function mountContextBackLinks(root: ParentNode = document): () => void {
	const referrerUrl = getSameOriginReferrer();
	if (!referrerUrl) return () => {};

	const currentPath = window.location.pathname;
	// Don't override the back link when the referrer is a child of the
	// current page — navigating "back" into a child is never correct.
	if (isChildPath(currentPath, referrerUrl.pathname)) return () => {};

	const referrerHref = toRelativeHref(referrerUrl);
	const cleanups: Array<{ node: Element; handler: (e: Event) => void }> = [];

	for (const node of root.querySelectorAll("[data-context-back-link]")) {
		if (!(node instanceof HTMLAnchorElement) || node.dataset.contextBackReady === "true") {
			continue;
		}

		node.dataset.contextBackReady = "true";

		const label = getBackLabel(referrerUrl.pathname);
		node.href = referrerHref;
		node.setAttribute("aria-label", label);

		const labelEl = node.querySelector("[data-context-back-label]");
		if (labelEl instanceof HTMLElement) {
			labelEl.textContent = label;
		}

		if (window.history.length > 1) {
			const handler = (event: Event) => {
				event.preventDefault();
				window.history.back();
			};
			node.addEventListener("click", handler);
			cleanups.push({ node, handler });
		}
	}

	return () => {
		for (const { node, handler } of cleanups) {
			node.removeEventListener("click", handler);
		}
	};
}
