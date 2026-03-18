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

	document.addEventListener("astro:before-preparation", cleanup, { once: true });
}
