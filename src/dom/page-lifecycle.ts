/**
 * Dispose page behavior on permanent departure, preserving its DOM state and
 * handlers when the browser freezes the document in the back/forward cache.
 */
export function onPageLeave(cleanup: () => void): () => void {
	const events = new AbortController();
	function dispose(): void {
		if (events.signal.aborted) return;
		events.abort();
		cleanup();
	}

	document.addEventListener("astro:before-preparation", dispose, { signal: events.signal });
	window.addEventListener(
		"pagehide",
		(event) => {
			if (!event.persisted) dispose();
		},
		{ signal: events.signal },
	);
	return dispose;
}
