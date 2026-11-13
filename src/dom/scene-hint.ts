/**
 * The "psst, click on stuff" note on the homepage. Shown once per visit, a
 * moment after the scene's intro, and gone the first time the visitor
 * clicks, taps, scrolls or presses a key (or after a few seconds).
 */
const SEEN_KEY = "sceneHintSeen";
const SHOW_AFTER_MS = 3200; // the desk intro runs ~2.8 s
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

	// Wait for the scene to be up, then for its intro to play.
	const start = () => {
		showTimer = window.setTimeout(show, SHOW_AFTER_MS);
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

	for (const type of ["pointerdown", "wheel", "keydown"] as const) {
		window.addEventListener(type, hide, { once: true, passive: true, signal: events.signal });
	}
}
