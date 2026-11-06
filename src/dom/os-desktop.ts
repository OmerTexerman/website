/**
 * Behaviour for the laptop desktop on the projects page: a live menu-bar
 * clock, click-to-focus and draggable windows, and a typed-out fastfetch.
 *
 * The page renders fully without this (the modal preview runs no scripts),
 * so everything here is enhancement only.
 */

const TYPE_DELAY_MS = 55;
const ROW_DELAY_MS = 45;

export function mountOsDesktop(root: ParentNode = document): () => void {
	const desktop = root.querySelector<HTMLElement>("[data-os-desktop]");
	if (!desktop) return () => {};

	const events = new AbortController();
	const { signal } = events;
	const timeouts = new Set<number>();
	const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

	function later(cb: () => void, delay: number): void {
		const id = window.setTimeout(() => {
			timeouts.delete(id);
			cb();
		}, delay);
		timeouts.add(id);
	}

	// ── Menu-bar clock ────────────────────────────────────────
	const clockEl = root.querySelector<HTMLElement>("#os-clock");
	const tick = () => {
		if (clockEl) {
			clockEl.textContent = new Date().toLocaleTimeString("en-US", {
				hour: "numeric",
				minute: "2-digit",
			});
		}
	};
	tick();
	const clockId = window.setInterval(tick, 15_000);

	// ── Windows: focus and drag ────────────────────────────────
	const windows = [...desktop.querySelectorAll<HTMLElement>("[data-os-window]")];
	let topZ = windows.length + 1;

	// The stylesheet sets --os-windowed to 1 only when the desktop is wide
	// enough to lay windows out side by side; stacked layouts don't drag.
	const isWindowed = () =>
		getComputedStyle(desktop).getPropertyValue("--os-windowed").trim() === "1";

	function focusWindow(win: HTMLElement): void {
		topZ += 1;
		win.style.zIndex = String(topZ);
		for (const w of windows) w.classList.toggle("is-focused", w === win);
	}

	function offsetOf(win: HTMLElement): [number, number] {
		return [Number(win.dataset.osX ?? 0), Number(win.dataset.osY ?? 0)];
	}

	function moveTo(win: HTMLElement, x: number, y: number): void {
		win.dataset.osX = String(x);
		win.dataset.osY = String(y);
		win.style.translate = x === 0 && y === 0 ? "" : `${x}px ${y}px`;
	}

	for (const win of windows) {
		win.addEventListener("pointerdown", () => focusWindow(win), { signal });

		const handle = win.querySelector<HTMLElement>("[data-os-drag]");
		if (!handle) continue;

		handle.addEventListener(
			"pointerdown",
			(event) => {
				if (event.button !== 0 || !isWindowed()) return;
				event.preventDefault();

				const [startX, startY] = offsetOf(win);
				const rect = win.getBoundingClientRect();
				const bounds = desktop.getBoundingClientRect();
				// Where the window would sit with no offset applied.
				const baseLeft = rect.left - startX;
				const baseTop = rect.top - startY;
				const minX = bounds.left - baseLeft;
				const maxX = bounds.right - (baseLeft + rect.width);
				const minY = bounds.top - baseTop;
				const maxY = bounds.bottom - (baseTop + Math.min(rect.height, 48));

				const originX = event.clientX;
				const originY = event.clientY;
				handle.setPointerCapture(event.pointerId);
				win.classList.add("is-dragging");

				const drag = new AbortController();
				handle.addEventListener(
					"pointermove",
					(move) => {
						const x = Math.min(maxX, Math.max(minX, startX + move.clientX - originX));
						const y = Math.min(maxY, Math.max(minY, startY + move.clientY - originY));
						moveTo(win, x, y);
					},
					{ signal: drag.signal },
				);
				const end = () => {
					drag.abort();
					win.classList.remove("is-dragging");
				};
				handle.addEventListener("pointerup", end, { signal: drag.signal });
				handle.addEventListener("pointercancel", end, { signal: drag.signal });
			},
			{ signal },
		);
	}

	// Dragged positions only make sense in the windowed layout.
	window.addEventListener(
		"resize",
		() => {
			if (isWindowed()) return;
			for (const win of windows) moveTo(win, 0, 0);
		},
		{ signal },
	);

	// ── Typed-out fastfetch ───────────────────────────────────
	const cmdEl = root.querySelector<HTMLElement>("#os-ff-cmd");
	const outputEl = root.querySelector<HTMLElement>("#os-ff");
	if (!reduceMotion && cmdEl && outputEl) {
		const command = cmdEl.textContent ?? "";
		const rows = [...outputEl.children] as HTMLElement[];
		cmdEl.textContent = "";
		outputEl.classList.add("is-typing");

		let i = 0;
		const typeChar = () => {
			if (i < command.length) {
				cmdEl.textContent += command[i];
				i += 1;
				later(typeChar, TYPE_DELAY_MS + Math.random() * 40);
				return;
			}
			rows.forEach((row, index) => {
				later(() => row.classList.add("is-shown"), 250 + index * ROW_DELAY_MS);
			});
		};
		later(typeChar, 700);
	}

	return () => {
		events.abort();
		window.clearInterval(clockId);
		for (const id of timeouts) window.clearTimeout(id);
		timeouts.clear();
	};
}
