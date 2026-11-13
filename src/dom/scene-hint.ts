/**
 * The "psst, click on stuff" note on the homepage. Shown at most once per
 * visit, and only to someone who has sat on the scene doing nothing for a
 * while: moving the pointer or scrolling restarts the wait, and a click,
 * tap or key press means they've found their way, so it never shows. Once
 * up, it goes on their next move (or after a few seconds).
 */
const SEEN_KEY = "sceneHintSeen";
/** How long the scene sits untouched (after its ~2.8 s intro) before the hint. */
const IDLE_MS = 15000;
const HIDE_AFTER_MS = 9000;

function alreadySeen(): boolean {
	try {
		return sessionStorage.getItem(SEEN_KEY) === "1";
	} catch {
		return false;
	}
}

function markSeen(): void {
	try {
		sessionStorage.setItem(SEEN_KEY, "1");
	} catch {
		/* storage unavailable */
	}
}

export function mountSceneHint(): void {
	const hint = document.querySelector<HTMLElement>("[data-scene-hint]");
	if (!hint || alreadySeen()) return;

	const events = new AbortController();
	let showTimer = 0;
	let hideTimer = 0;

	const hide = () => {
		window.clearTimeout(showTimer);
		window.clearTimeout(hideTimer);
		hint.classList.remove("is-visible");
		events.abort();
		markSeen();
	};

	const show = () => {
		hint.classList.add("is-visible");
		hideTimer = window.setTimeout(hide, HIDE_AFTER_MS);
	};

	// Wait for the scene to be up, then for the visitor to sit idle.
	let ready = false;
	const restartIdle = () => {
		if (!ready || hint.classList.contains("is-visible")) return;
		window.clearTimeout(showTimer);
		showTimer = window.setTimeout(show, IDLE_MS);
	};
	const start = () => {
		ready = true;
		restartIdle();
	};
	if (document.documentElement.dataset.sceneReady === "true") start();
	else {
		const observer = new MutationObserver(() => {
			if (document.documentElement.dataset.sceneReady !== "true") return;
			observer.disconnect();
			start();
		});
		observer.observe(document.documentElement, { attributeFilter: ["data-scene-ready"] });
		events.signal.addEventListener("abort", () => observer.disconnect());
	}

	// Clicking or typing: they've found their way, no hint this visit.
	for (const type of ["pointerdown", "keydown"] as const) {
		window.addEventListener(type, hide, { passive: true, signal: events.signal });
	}
	// Looking around: still exploring. Restart the wait, or put the hint away.
	for (const type of ["pointermove", "wheel", "touchmove"] as const) {
		window.addEventListener(
			type,
			() => (hint.classList.contains("is-visible") ? hide() : restartIdle()),
			{ passive: true, signal: events.signal },
		);
	}
}
