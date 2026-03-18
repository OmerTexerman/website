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

export function mountSceneApp(): () => void {
	const fallback = document.getElementById("scene-fallback");
	const sceneRoot = document.getElementById("scene-root");

	if (!(sceneRoot instanceof HTMLElement)) return () => {};
	const root = sceneRoot;

	let sceneHandle: SceneHandle | null = null;
	let activeMode: "desktop" | "mobile" | null = null;
	let transitionQueue: Promise<void> = Promise.resolve();
	let modeSyncFrame = 0;
	let fallbackTimer = 0;

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
		if (!sceneHandle) {
			const canvas = document.getElementById("scene-canvas");
			const labels = document.getElementById("scene-labels");
			if (!(canvas instanceof HTMLCanvasElement) || !(labels instanceof HTMLElement)) return;

			const { initUnifiedScene } = await import("../three/unified-scene");
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

	function cleanup(): void {
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
	}

	document.addEventListener("astro:before-preparation", cleanup, { once: true });
	window.addEventListener("beforeunload", cleanup, { once: true });
	scheduleModeSync();

	return cleanup;
}
