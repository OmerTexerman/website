/**
 * Swipe down to dismiss the full-screen section view on touch screens.
 *
 * A downward drag only starts dismissing when whatever is under the finger is
 * already scrolled to its top, so ordinary scrolling is untouched. The view
 * follows the finger and the room dims as it goes; letting go past the
 * distance or speed threshold closes it, otherwise it springs back.
 */

const LOCK_DISTANCE_PX = 8;
const DISMISS_DISTANCE_PX = 120;
const DISMISS_VELOCITY_PX_PER_MS = 0.55;
const SPRING_BACK = "translate 0.28s cubic-bezier(0.16, 1, 0.3, 1)";

interface SwipeDismissOptions {
	/** Element the gesture is read from (the scrolling body). */
	surfaceEl: HTMLElement;
	/** Element moved with the finger. */
	panelEl: HTMLElement;
	/** Element dimmed with the drag. */
	backdropEl: HTMLElement;
	isOpen: () => boolean;
	onDismiss: () => void;
}

/** True when any scrollable ancestor between `from` and `root` is scrolled down. */
function isScrolledAwayFromTop(from: EventTarget | null, root: HTMLElement): boolean {
	let el = from instanceof Element ? from : null;
	while (el && el !== root.parentElement) {
		if (el instanceof HTMLElement && el.scrollTop > 0 && el.scrollHeight > el.clientHeight) {
			return true;
		}
		el = el.parentElement;
	}
	return false;
}

export function mountSwipeDismiss(options: SwipeDismissOptions): () => void {
	const { surfaceEl, panelEl, backdropEl, isOpen, onDismiss } = options;
	const events = new AbortController();
	const { signal } = events;

	let startX = 0;
	let startY = 0;
	let startAt = 0;
	let tracking = false;
	let dragging = false;
	let offset = 0;

	function reset(animated: boolean): void {
		panelEl.style.transition = animated ? SPRING_BACK : "";
		panelEl.style.translate = "";
		backdropEl.style.opacity = "1";
		if (animated) {
			panelEl.addEventListener(
				"transitionend",
				() => {
					panelEl.style.transition = "";
				},
				{ once: true },
			);
		}
	}

	surfaceEl.addEventListener(
		"touchstart",
		(e) => {
			if (!isOpen() || e.touches.length !== 1) return;
			// Only from the top of whatever is under the finger.
			if (isScrolledAwayFromTop(e.target, surfaceEl)) return;
			const touch = e.touches[0];
			startX = touch.clientX;
			startY = touch.clientY;
			startAt = performance.now();
			tracking = true;
			dragging = false;
			offset = 0;
		},
		{ signal, passive: true },
	);

	surfaceEl.addEventListener(
		"touchmove",
		(e) => {
			if (!tracking) return;
			const touch = e.touches[0];
			const dx = touch.clientX - startX;
			const dy = touch.clientY - startY;
			if (!dragging) {
				if (Math.hypot(dx, dy) < LOCK_DISTANCE_PX) return;
				// Upward or sideways first: it's a scroll or pan, not a dismiss.
				if (dy <= 0 || Math.abs(dx) > dy) {
					tracking = false;
					return;
				}
				dragging = true;
				panelEl.style.transition = "";
			}
			e.preventDefault();
			offset = Math.max(0, dy);
			panelEl.style.translate = `0 ${offset}px`;
			backdropEl.style.opacity = String(Math.max(0.25, 1 - offset / 600));
		},
		{ signal, passive: false },
	);

	function end(): void {
		if (!tracking) return;
		tracking = false;
		if (!dragging) return;
		dragging = false;
		const elapsed = Math.max(1, performance.now() - startAt);
		const velocity = offset / elapsed;
		if (offset > DISMISS_DISTANCE_PX || velocity > DISMISS_VELOCITY_PX_PER_MS) {
			onDismiss();
		} else {
			reset(true);
		}
	}

	surfaceEl.addEventListener("touchend", end, { signal });
	surfaceEl.addEventListener(
		"touchcancel",
		() => {
			if (dragging) reset(true);
			tracking = false;
			dragging = false;
		},
		{ signal },
	);

	return () => events.abort();
}
