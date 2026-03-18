export function showRevealed(el: HTMLElement): void {
	el.classList.remove("reveal-pending");
	el.classList.add("is-visible");
}

export function setRevealPending(el: HTMLElement): void {
	el.classList.add("reveal-pending");
}

export function revealAnimatedChildren(root: ParentNode): void {
	root.querySelectorAll<HTMLElement>("[data-animate]").forEach((el) => {
		showRevealed(el);
	});
}
