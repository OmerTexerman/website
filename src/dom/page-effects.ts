import { setRevealPending, showRevealed } from "./reveal";

const PAGE_VISIBILITY_OFFSET = 40;

function isInitiallyVisible(el: HTMLElement): boolean {
	const rect = el.getBoundingClientRect();
	return rect.bottom > 0 && rect.top < window.innerHeight - PAGE_VISIBILITY_OFFSET;
}

export function mountRevealAnimations(root: Document | Element = document): () => void {
	const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const animatedNodes = [...root.querySelectorAll<HTMLElement>("[data-animate]")];

	if (reduceMotion || animatedNodes.length === 0) {
		animatedNodes.forEach((el) => {
			showRevealed(el);
		});
		return () => {};
	}

	const observer = new IntersectionObserver(
		(entries) => {
			entries.forEach((entry) => {
				if (!entry.isIntersecting) return;
				const target = entry.target instanceof HTMLElement ? entry.target : null;
				if (!target) return;
				showRevealed(target);
				observer.unobserve(entry.target);
			});
		},
		{ threshold: 0.1, rootMargin: "0px 0px -40px 0px" },
	);

	animatedNodes.forEach((el) => {
		if (isInitiallyVisible(el)) {
			showRevealed(el);
			return;
		}
		setRevealPending(el);
		observer.observe(el);
	});

	return () => observer.disconnect();
}

export function initPosthogAnalytics(): void {
	const posthogKey = document.body.dataset.posthogKey;
	const posthogHost = document.body.dataset.posthogHost;

	if (!posthogKey || !import.meta.env.PROD) return;

	const timer = setTimeout(() => {
		console.warn("[analytics] posthog-js dynamic import did not resolve within 3s");
	}, 3000);
	void import("posthog-js/dist/module.no-external")
		.then(({ default: posthog }) => {
			clearTimeout(timer);
			posthog.init(posthogKey, {
				api_host: posthogHost,
				capture_pageview: true,
				autocapture: false,
			});
		})
		.catch((err) => {
			clearTimeout(timer);
			console.warn("[analytics] posthog-js failed to load", err);
		});
}
