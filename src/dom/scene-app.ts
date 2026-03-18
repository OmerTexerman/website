import { parseShelfBooks, type ShelfBook } from "../content/types";

interface SceneHandle {
	cleanup: () => void;
	transition: (target: "desktop" | "mobile") => Promise<void>;
}

function parseBooks(sceneRoot: HTMLElement): ShelfBook[] | undefined {
	const booksData = sceneRoot.querySelector("template[data-scene-books]");
	if (!(booksData instanceof HTMLTemplateElement)) return undefined;
	const raw = booksData.textContent?.trim();
	if (!raw) return undefined;

	try {
		return parseShelfBooks(JSON.parse(raw));
	} catch {
		return undefined;
	}
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
		fallback.setAttribute("aria-hidden", visible ? "false" : "true");
		fallback.inert = !visible;
	}

	function modeFromSceneWidth(): "desktop" | "mobile" {
		const rect = root.getBoundingClientRect();
		const width = Math.max(1, Math.round(rect.width || root.clientWidth || window.innerWidth));
		return width >= 768 ? "desktop" : "mobile";
	}

	async function applyMode(mode: "desktop" | "mobile"): Promise<void> {
		const gen = generation;
		if (!sceneHandle) {
			const canvas = document.getElementById("scene-canvas");
			const labels = document.getElementById("scene-labels");
			if (!(canvas instanceof HTMLCanvasElement) || !(labels instanceof HTMLElement)) return;

			const { initUnifiedScene } = await import("../three/unified-scene");
			// If cleanup ran while the import was in flight, abandon this mount
			if (gen !== generation) return;
			sceneHandle = initUnifiedScene(canvas, labels, mode, parseBooks(root));
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
		listenerAc.abort(); // Remove astro:before-preparation and beforeunload listeners
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
	window.addEventListener("beforeunload", cleanup, {
		once: true,
		signal: listenerAc.signal,
	});
	scheduleModeSync();

	return cleanup;
}
