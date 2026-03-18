export interface ContentModalApi {
	open: (label: string, href: string) => void;
	close: () => void;
	onClose: (cb: () => void) => () => void;
}

let currentApi: ContentModalApi | null = null;
let currentCleanup: (() => void) | null = null;

export function getContentModal(): ContentModalApi | null {
	return currentApi;
}

export function registerContentModal(api: ContentModalApi, cleanup: () => void): void {
	const previousCleanup = currentCleanup;
	if (previousCleanup && previousCleanup !== cleanup) {
		currentApi = null;
		currentCleanup = null;
		previousCleanup();
	}

	currentApi = api;
	currentCleanup = cleanup;
}

export function unregisterContentModal(cleanup?: () => void): void {
	if (cleanup && currentCleanup !== cleanup) return;
	currentApi = null;
	currentCleanup = null;
}
