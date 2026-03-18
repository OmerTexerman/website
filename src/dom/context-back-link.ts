import { getBackLabel } from "../config";
import { getSameOriginReferrer, toRelativeHref } from "../url-utils";

export function mountContextBackLinks(root: ParentNode = document): void {
	const referrerUrl = getSameOriginReferrer();
	if (!referrerUrl) return;

	const referrerHref = toRelativeHref(referrerUrl);

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
			node.addEventListener("click", (event) => {
				event.preventDefault();
				window.history.back();
			});
		}
	}
}
