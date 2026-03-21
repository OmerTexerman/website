import { getContentModal } from "./api";
import { mountContentModal } from "./controller";
import { consumeContentModalReturnState } from "./history";

export function bootstrapContentModal(root = document.getElementById("content-modal")): void {
	if (!(root instanceof HTMLElement)) return;

	const cleanup = mountContentModal(root);
	const returnState = consumeContentModalReturnState();
	if (returnState) {
		getContentModal()?.open(returnState.label, returnState.href);
	}

	// Clean up on View-Transition navigation or page unload / bfcache storage.
	// pagehide is the web-platform-recommended teardown event — it fires
	// reliably before bfcache storage and permanent unloads.
	document.addEventListener("astro:before-preparation", cleanup, { once: true });
	window.addEventListener("pagehide", cleanup, { once: true });
}
