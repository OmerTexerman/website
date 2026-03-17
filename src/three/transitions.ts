const FADE_DURATION = 400;

export function navigateWithFade(href: string): void {
	// Create overlay
	const overlay = document.createElement("div");
	overlay.style.cssText = `
		position: fixed;
		inset: 0;
		background: #0a0a0a;
		z-index: 200;
		opacity: 0;
		transition: opacity ${FADE_DURATION}ms ease;
		pointer-events: all;
	`;
	document.body.appendChild(overlay);

	// Trigger fade
	requestAnimationFrame(() => {
		overlay.style.opacity = "1";
	});

	// Navigate after fade completes
	setTimeout(() => {
		window.location.href = href;
	}, FADE_DURATION);
}
