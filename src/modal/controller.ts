import { revealAnimatedChildren } from "../dom/reveal";
import { getSameOriginUrl } from "../url-utils";
import { type ContentModalApi, registerContentModal, unregisterContentModal } from "./api";
import { type ContentModalHistoryState, rememberContentModalReturnState } from "./history";
import { loadContentPreview } from "./preview";

interface ContentModalElements {
	rootEl: HTMLElement;
	backdropEl: HTMLElement;
	panelEl: HTMLElement;
	titleEl: HTMLElement;
	bodyEl: HTMLElement;
	linkEl: HTMLAnchorElement;
	closeButtonEl: HTMLButtonElement;
}

type ModalState = "closed" | "opening" | "open" | "closing";

const FOCUSABLE =
	'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function mountContentModal(rootEl: HTMLElement): () => void {
	const elements = resolveContentModalElements(rootEl);
	if (!elements) return () => {};

	const controller = createContentModalController(elements);
	registerContentModal(controller.api, controller.cleanup);
	controller.setup();
	return controller.cleanup;
}

function resolveContentModalElements(rootEl: HTMLElement): ContentModalElements | null {
	const backdropEl = rootEl.querySelector("#content-modal-backdrop");
	const panelEl = rootEl.querySelector("#content-modal-panel");
	const titleEl = rootEl.querySelector("#content-modal-title");
	const bodyEl = rootEl.querySelector("#content-modal-body");
	const linkEl = rootEl.querySelector("#content-modal-link");
	const closeButtonEl = rootEl.querySelector("#content-modal-close");

	if (
		!(backdropEl instanceof HTMLElement) ||
		!(panelEl instanceof HTMLElement) ||
		!(titleEl instanceof HTMLElement) ||
		!(bodyEl instanceof HTMLElement) ||
		!(linkEl instanceof HTMLAnchorElement) ||
		!(closeButtonEl instanceof HTMLButtonElement)
	) {
		return null;
	}

	return {
		rootEl,
		backdropEl,
		panelEl,
		titleEl,
		bodyEl,
		linkEl,
		closeButtonEl,
	};
}

function createContentModalController(elements: ContentModalElements): {
	api: ContentModalApi;
	setup: () => void;
	cleanup: () => void;
} {
	const { rootEl, backdropEl, panelEl, titleEl, bodyEl, linkEl, closeButtonEl } = elements;
	const closeCallbacks = new Set<() => void>();
	const siblingStates = new Map<HTMLElement, { ariaHidden: string | null; inert: boolean }>();
	const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

	let previousActiveElement: HTMLElement | null = null;
	let activeRequest: AbortController | null = null;
	let activeView: ContentModalHistoryState | null = null;
	let previewRequestId = 0;
	let modalState: ModalState = "closed";
	let savedBodyOverflow = "";
	let animationToken = 0;
	let isSetup = false;
	let isCleanedUp = false;

	function setMounted(mounted: boolean): void {
		rootEl.classList.toggle("invisible", !mounted);
		rootEl.classList.toggle("pointer-events-none", !mounted);
		rootEl.classList.toggle("pointer-events-auto", mounted);
		rootEl.setAttribute("aria-hidden", mounted ? "false" : "true");
	}

	function applyClosedVisualState(): void {
		backdropEl.style.opacity = "0";
		panelEl.style.opacity = "0";
		panelEl.style.translate = "0 88px";
		bodyEl.style.overflowY = "hidden";
	}

	function applyOpenVisualState(): void {
		backdropEl.style.opacity = "1";
		panelEl.style.opacity = "1";
		panelEl.style.translate = "0 0";
		bodyEl.style.overflowY = "auto";
	}

	function cancelAnimations(): void {
		for (const animation of [...backdropEl.getAnimations(), ...panelEl.getAnimations()]) {
			animation.cancel();
		}
	}

	async function animateVisualState(open: boolean): Promise<boolean> {
		const token = ++animationToken;
		cancelAnimations();

		if (reduceMotionQuery.matches) {
			if (open) applyOpenVisualState();
			else applyClosedVisualState();
			return token === animationToken;
		}

		bodyEl.style.overflowY = "hidden";

		const backdropAnimation = backdropEl.animate(
			[{ opacity: open ? 0 : 1 }, { opacity: open ? 1 : 0 }],
			{
				duration: open ? 140 : 100,
				easing: "ease",
				fill: "forwards",
			},
		);

		const panelAnimation = panelEl.animate(
			[
				{
					opacity: open ? 0 : 1,
					translate: `0 ${open ? "88px" : "0px"}`,
				},
				{
					opacity: open ? 1 : 0,
					translate: `0 ${open ? "0px" : "72px"}`,
				},
			],
			{
				duration: open ? 180 : 110,
				easing: open ? "cubic-bezier(0.16, 1, 0.3, 1)" : "ease-in",
				fill: "forwards",
			},
		);

		await Promise.allSettled([backdropAnimation.finished, panelAnimation.finished]);
		if (token !== animationToken) return false;

		if (open) applyOpenVisualState();
		else applyClosedVisualState();
		return true;
	}

	function lockDocumentScroll(): void {
		savedBodyOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
	}

	function unlockDocumentScroll(): void {
		document.body.style.overflow = savedBodyOverflow;
	}

	function syncSiblings(disabled: boolean): void {
		for (const el of [...document.body.children]) {
			if (!(el instanceof HTMLElement) || el === rootEl) continue;

			if (disabled) {
				siblingStates.set(el, {
					ariaHidden: el.getAttribute("aria-hidden"),
					inert: el.inert,
				});
				el.setAttribute("aria-hidden", "true");
				el.inert = true;
			} else {
				const previous = siblingStates.get(el);
				if (!previous) continue;
				if (previous.ariaHidden === null) el.removeAttribute("aria-hidden");
				else el.setAttribute("aria-hidden", previous.ariaHidden);
				el.inert = previous.inert;
			}
		}

		if (!disabled) siblingStates.clear();
	}

	function renderLoading(): void {
		bodyEl.replaceChildren();
		const wrapper = document.createElement("div");
		wrapper.className = "flex items-center justify-center py-12";
		const spinner = document.createElement("div");
		spinner.className =
			"w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin";
		wrapper.append(spinner);
		bodyEl.append(wrapper);
	}

	function renderMessage(message: string, href: string): void {
		bodyEl.replaceChildren();
		const paragraph = document.createElement("p");
		paragraph.className = "text-muted text-center py-8";
		paragraph.append(document.createTextNode(`${message} `));
		const anchor = document.createElement("a");
		anchor.href = href;
		anchor.className = "text-accent underline";
		anchor.textContent = "Visit the page";
		paragraph.append(anchor);
		bodyEl.append(paragraph);
	}

	function rememberReturnState(): void {
		if (!activeView) return;
		rememberContentModalReturnState(activeView);
	}

	function isModifiedClick(event: MouseEvent): boolean {
		return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
	}

	function isSameOriginNavigation(anchor: HTMLAnchorElement): boolean {
		if (anchor.target && anchor.target !== "_self") return false;
		if (anchor.hasAttribute("download")) return false;
		return getSameOriginUrl(anchor.href) !== null;
	}

	function handleNavigationIntent(event: MouseEvent): void {
		if (modalState === "closed" || event.defaultPrevented || isModifiedClick(event)) return;
		const target = event.target;
		if (!(target instanceof Element)) return;

		const anchor = target.closest("a");
		if (!(anchor instanceof HTMLAnchorElement) || !isSameOriginNavigation(anchor)) return;
		rememberReturnState();
	}

	function trapFocus(e: KeyboardEvent): void {
		if (e.key !== "Tab" || modalState === "closed") return;

		const focusable = [...panelEl.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
			(el) => !el.hasAttribute("disabled") && el.offsetParent !== null,
		);
		if (focusable.length === 0) {
			e.preventDefault();
			closeButtonEl.focus();
			return;
		}

		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (e.shiftKey && document.activeElement === first) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault();
			first.focus();
		}
	}

	function isStalePreviewRequest(requestId: number): boolean {
		return requestId !== previewRequestId || modalState !== "open";
	}

	async function openModal(label: string, href: string, source?: string): Promise<void> {
		const requestId = ++previewRequestId;
		activeRequest?.abort();
		const request = new AbortController();
		activeRequest = request;
		const timeoutId = setTimeout(() => request.abort(), 10_000);

		titleEl.textContent = label;
		linkEl.href = href;
		rootEl.dataset.section = href.replace(/^\/|\/$/g, "").split("/")[0];
		if (source) {
			rootEl.dataset.source = source;
		} else {
			delete rootEl.dataset.source;
		}
		activeView = { label, href };
		renderLoading();

		if (modalState === "closed") {
			previousActiveElement =
				document.activeElement instanceof HTMLElement ? document.activeElement : null;
			lockDocumentScroll();
			syncSiblings(true);
			setMounted(true);
			applyClosedVisualState();
			modalState = "opening";
			await animateVisualState(true);
			if (modalState !== "opening") return;
			modalState = "open";
			closeButtonEl.focus();
		} else {
			cancelAnimations();
			setMounted(true);
			applyOpenVisualState();
			modalState = "open";
		}

		try {
			const result = await loadContentPreview(href, request.signal);
			if (isStalePreviewRequest(requestId)) return;

			if (result.kind === "message") {
				renderMessage(result.message, href);
				return;
			}

			bodyEl.replaceChildren(...result.nodes);
			revealAnimatedChildren(bodyEl);
		} catch (err: unknown) {
			if (err instanceof DOMException && err.name === "AbortError") return;
			if (isStalePreviewRequest(requestId)) return;
			renderMessage("Could not load preview.", href);
		} finally {
			clearTimeout(timeoutId);
		}
	}

	async function requestClose(): Promise<void> {
		if (modalState === "closed" || modalState === "closing") return;

		activeRequest?.abort();
		activeRequest = null;
		previewRequestId += 1;
		modalState = "closing";
		await animateVisualState(false);
		if (modalState !== "closing") return;

		modalState = "closed";
		activeView = null;
		setMounted(false);
		syncSiblings(false);
		unlockDocumentScroll();
		for (const cb of closeCallbacks) cb();
		if (previousActiveElement?.isConnected) previousActiveElement.focus();
		previousActiveElement = null;
	}

	function onClose(cb: () => void): () => void {
		closeCallbacks.add(cb);
		return () => {
			closeCallbacks.delete(cb);
		};
	}

	function handleBackdropClick(): void {
		void requestClose();
	}

	function handleKeydown(e: KeyboardEvent): void {
		if (modalState === "closed") return;
		if (e.key === "Escape") {
			e.preventDefault();
			void requestClose();
			return;
		}

		trapFocus(e);
	}

	function cleanup(): void {
		if (isCleanedUp) return;
		isCleanedUp = true;

		activeRequest?.abort();
		activeRequest = null;
		previewRequestId += 1;
		activeView = null;
		cancelAnimations();
		modalState = "closed";
		setMounted(false);
		applyClosedVisualState();
		syncSiblings(false);
		unlockDocumentScroll();
		previousActiveElement = null;
		closeCallbacks.clear();
		closeButtonEl.removeEventListener("click", requestCloseHandler);
		backdropEl.removeEventListener("click", handleBackdropClick);
		bodyEl.removeEventListener("click", handleNavigationIntent);
		linkEl.removeEventListener("click", handleNavigationIntent);
		document.removeEventListener("keydown", handleKeydown);
		unregisterContentModal(cleanup);
	}

	function requestCloseHandler(): void {
		void requestClose();
	}

	function setup(): void {
		if (isSetup) return;
		isSetup = true;

		if (rootEl.parentElement !== document.body) {
			document.body.append(rootEl);
		}

		setMounted(false);
		applyClosedVisualState();
		closeButtonEl.addEventListener("click", requestCloseHandler);
		backdropEl.addEventListener("click", handleBackdropClick);
		bodyEl.addEventListener("click", handleNavigationIntent);
		linkEl.addEventListener("click", handleNavigationIntent);
		document.addEventListener("keydown", handleKeydown);
	}

	return {
		api: {
			open: (label, href, source) => {
				void openModal(label, href, source);
			},
			close: requestCloseHandler,
			onClose,
		},
		setup,
		cleanup,
	};
}
