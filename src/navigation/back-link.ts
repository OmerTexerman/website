const KNOWN_BACK_LABELS: Record<string, string> = {
	"/": "Back to desk",
	"/blog": "Back to blog",
	"/photos": "Back to photos",
	"/projects": "Back to projects",
	"/reading": "Back to reading",
};

function getSameOriginReferrer(): URL | null {
	if (!document.referrer) return null;

	try {
		const url = new URL(document.referrer);
		return url.origin === window.location.origin ? url : null;
	} catch {
		return null;
	}
}

function getBackLabel(pathname: string): string {
	return KNOWN_BACK_LABELS[pathname] ?? "Go back";
}

export function hydrateContextBackLinks(root: ParentNode = document): void {
	const referrerUrl = getSameOriginReferrer();
	if (!referrerUrl) return;

	const referrerHref = `${referrerUrl.pathname}${referrerUrl.search}${referrerUrl.hash}`;

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
