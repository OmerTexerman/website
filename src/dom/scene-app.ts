import { parseShelfBooks, type ShelfBook } from "../content/types";

interface SceneHandle {
	cleanup: () => void;
	transition: (target: "desktop" | "mobile") => Promise<void>;
}

function parseBooks(sceneRoot: HTMLElement): ShelfBook[] | undefined {
	const booksData = sceneRoot.querySelector("script[data-scene-books]");
	if (!booksData) return undefined;
	const raw = booksData.textContent?.trim();
	if (!raw) return undefined;

	try {
		return parseShelfBooks(JSON.parse(raw));
	} catch {
		return undefined;
	}
}

const SCENE_VISITED_KEY = "sceneIntroPlayed";

function hasPlayedIntro(): boolean {
	try {
		return sessionStorage.getItem(SCENE_VISITED_KEY) === "1";
	} catch {
		return false;
	}
}

function markIntroPlayed(): void {
	try {
		sessionStorage.setItem(SCENE_VISITED_KEY, "1");
	} catch {
		/* storage unavailable */
	}
}

/**
 * Ensure the canvas has a usable WebGL context for (re-)mounting the scene.
 *
 * - First mount (no `data-scene-used`): return as-is without probing, so
 *   Three.js can create its context with the desired attributes (antialias,
 *   powerPreference).
 * - Re-mount (`data-scene-used` present): probe the existing context.
 *   • If the context survived (common on desktop bfcache), return the same
 *     canvas — Three.js will reuse the surviving context for instant restore.
 *   • If the context was lost (mobile memory pressure, GPU reset), replace
 *     the canvas with a fresh clone so Three.js can start clean.
 */
function ensureFreshCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
	if (!canvas.dataset.sceneUsed) return canvas;

	// Canvas was used before — safe to probe because attributes are already set.
	const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
	if (gl && !gl.isContextLost()) return canvas;

	// Context lost — swap in a fresh canvas.
	const fresh = canvas.cloneNode(false) as HTMLCanvasElement;
	delete fresh.dataset.sceneUsed;
	canvas.replaceWith(fresh);
	return fresh;
}

/**
 * Clear any leftover label elements from a prior mount so the new
 * label controller starts with a clean container.
 */
function clearStaleLabels(): void {
	const labels = document.getElementById("scene-labels");
	if (labels) labels.innerHTML = "";
}

/** Tracks the active mount's cleanup so HMR re-execution tears down the old instance first. */
let activeCleanup: (() => void) | null = null;

export function mountSceneApp(): () => void {
	// Tear down any previous mount (HMR re-execution or accidental double-call)
	if (activeCleanup) {
		activeCleanup();
		activeCleanup = null;
	}

	const fallback = document.getElementById("scene-fallback");
	const sceneRoot = document.getElementById("scene-root");

	if (!(sceneRoot instanceof HTMLElement)) return () => {};
	const root = sceneRoot;

	let sceneHandle: SceneHandle | null = null;
	let activeMode: "desktop" | "mobile" | null = null;
	let transitionQueue: Promise<void> = Promise.resolve();
	let modeSyncFrame = 0;
	let fallbackTimer = 0;
	let generation = 0;

	function setFallbackVisible(visible: boolean): void {
		if (!(fallback instanceof HTMLElement)) return;
		if (visible) {
			fallback.removeAttribute("aria-hidden");
			fallback.removeAttribute("inert");
		} else {
			fallback.setAttribute("aria-hidden", "true");
			fallback.setAttribute("inert", "");
		}
	}

	function modeFromSceneWidth(): "desktop" | "mobile" {
		const rect = root.getBoundingClientRect();
		const width = Math.max(1, Math.round(rect.width || root.clientWidth || window.innerWidth));
		return width >= 768 ? "desktop" : "mobile";
	}

	async function applyMode(mode: "desktop" | "mobile"): Promise<void> {
		const gen = generation;
		if (!sceneHandle) {
			let canvas = document.getElementById("scene-canvas");
			const labels = document.getElementById("scene-labels");
			if (!(canvas instanceof HTMLCanvasElement) || !(labels instanceof HTMLElement)) return;

			// Swap out any canvas with a dead WebGL context (bfcache, GPU reset, …)
			canvas = ensureFreshCanvas(canvas);

			const { initUnifiedScene } = await import("../three/unified-scene");
			// If cleanup ran while the import was in flight, abandon this mount
			if (gen !== generation) return;

			// Re-check the canvas after the async gap — another mount could
			// have replaced it, or the context could have been lost while we
			// were waiting for the dynamic import.
			const rawCanvas = document.getElementById("scene-canvas");
			if (!(rawCanvas instanceof HTMLCanvasElement)) return;
			const currentCanvas = ensureFreshCanvas(rawCanvas);

			const skipIntro = hasPlayedIntro();

			try {
				sceneHandle = initUnifiedScene(currentCanvas, labels, mode, parseBooks(root), {
					skipIntro,
				});
			} catch (initError) {
				// Last-resort recovery: replace canvas and try once more
				console.warn("Scene init failed, retrying with fresh canvas", initError);
				const retryCanvas = document.createElement("canvas");
				retryCanvas.id = currentCanvas.id;
				retryCanvas.className = currentCanvas.className;
				const ariaLabel = currentCanvas.getAttribute("aria-label");
				if (ariaLabel) retryCanvas.setAttribute("aria-label", ariaLabel);
				currentCanvas.replaceWith(retryCanvas);

				try {
					sceneHandle = initUnifiedScene(retryCanvas, labels, mode, parseBooks(root), {
						skipIntro,
					});
				} catch (retryError) {
					console.error("Scene init failed after retry — showing fallback", retryError);
					document.documentElement.dataset.sceneFallback = "visible";
					setFallbackVisible(true);
					return;
				}
			}

			markIntroPlayed();
			(window as Window & { __sceneHandle?: SceneHandle }).__sceneHandle = sceneHandle;
			window.clearTimeout(fallbackTimer);
			delete document.documentElement.dataset.sceneFallback;
			setFallbackVisible(false);
			document.documentElement.dataset.sceneReady = "true";
			activeMode = mode;
			return;
		}

		if (mode === activeMode) return;

		await sceneHandle.transition(mode);
		activeMode = mode;
	}

	function queueModeSync(): void {
		transitionQueue = transitionQueue
			.then(() => applyMode(modeFromSceneWidth()))
			.catch((error) => {
				console.error("Failed to update scene mode", error);
			});
	}

	function scheduleModeSync(): void {
		if (modeSyncFrame) return;
		modeSyncFrame = requestAnimationFrame(() => {
			modeSyncFrame = 0;
			queueModeSync();
		});
	}

	const resizeObserver =
		typeof ResizeObserver !== "undefined"
			? new ResizeObserver(() => {
					scheduleModeSync();
				})
			: null;

	clearStaleLabels();
	setFallbackVisible(false);
	fallbackTimer = window.setTimeout(() => {
		if (!sceneHandle) {
			document.documentElement.dataset.sceneFallback = "visible";
			setFallbackVisible(true);
		}
	}, 900);

	resizeObserver?.observe(root);

	const listenerAc = new AbortController();

	function cleanup(): void {
		generation++; // Invalidate any in-flight async work (e.g. dynamic import)
		listenerAc.abort(); // Remove astro:before-preparation and pagehide listeners
		sceneHandle?.cleanup();
		sceneHandle = null;
		activeMode = null;
		delete (window as Window & { __sceneHandle?: SceneHandle }).__sceneHandle;
		resizeObserver?.disconnect();
		if (modeSyncFrame) cancelAnimationFrame(modeSyncFrame);
		window.clearTimeout(fallbackTimer);
		fallbackTimer = 0;
		delete document.documentElement.dataset.sceneFallback;
		delete document.documentElement.dataset.sceneReady;
		setFallbackVisible(false);
		if (activeCleanup === cleanup) activeCleanup = null;
	}

	activeCleanup = cleanup;

	document.addEventListener("astro:before-preparation", cleanup, {
		once: true,
		signal: listenerAc.signal,
	});
	// pagehide is the web-platform-recommended event for teardown before
	// bfcache storage or permanent unload (web.dev, Chrome DevRel).
	// beforeunload is intentionally omitted — it adds no safety since
	// pagehide fires in every modern browser (IE 11+) and web.dev
	// explicitly discourages beforeunload for non-prompt cleanup work.
	window.addEventListener("pagehide", cleanup, {
		once: true,
		signal: listenerAc.signal,
	});
	scheduleModeSync();

	return cleanup;
}
