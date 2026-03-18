import { getSameOriginHref } from "../url-utils";

export interface ContentModalHistoryState {
	href: string;
	label: string;
}

const HISTORY_KEY = "contentModalReturn";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function normalizeHref(href: string): string | null {
	return getSameOriginHref(href);
}

function normalizeState(value: unknown): ContentModalHistoryState | null {
	if (!isRecord(value) || typeof value.href !== "string" || typeof value.label !== "string") {
		return null;
	}

	const href = normalizeHref(value.href);
	const label = value.label.trim();
	if (!href || !label) return null;

	return { href, label };
}

export function rememberContentModalReturnState(next: ContentModalHistoryState): void {
	const href = normalizeHref(next.href);
	const label = next.label.trim();
	if (!href || !label) return;

	const historyState = isRecord(window.history.state) ? { ...window.history.state } : {};
	historyState[HISTORY_KEY] = { href, label };
	window.history.replaceState(historyState, "", window.location.href);
}

export function consumeContentModalReturnState(): ContentModalHistoryState | null {
	const historyState = isRecord(window.history.state) ? { ...window.history.state } : null;
	const modalState = normalizeState(historyState?.[HISTORY_KEY]);
	if (!historyState || !modalState) return null;

	delete historyState[HISTORY_KEY];
	const nextState = Object.keys(historyState).length > 0 ? historyState : null;
	window.history.replaceState(nextState, "", window.location.href);
	return modalState;
}
