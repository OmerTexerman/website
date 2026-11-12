/**
 * The about card's email link. The address is stored in two halves so it
 * never appears in the page for scrapers. The first click puts it together
 * and shows it; the next click copies it to the clipboard.
 *
 * Mounted on the /about page and again whenever the content modal renders
 * it (the modal preview runs no scripts).
 */
export function mountAboutCard(root: ParentNode = document): () => void {
	const link = root.querySelector<HTMLAnchorElement>("[data-email-user]");
	if (!link) return () => {};

	const events = new AbortController();
	let address: string | null = null;
	let resetTimer = 0;

	link.addEventListener(
		"click",
		(event) => {
			event.preventDefault();
			const { emailUser, emailDomain } = link.dataset;
			if (!emailUser || !emailDomain) return;

			if (!address) {
				address = `${emailUser}@${emailDomain}`;
				link.textContent = address;
				link.title = "Click to copy";
				return;
			}

			const shown = address;
			void navigator.clipboard
				?.writeText(shown)
				.then(() => {
					link.textContent = "copied!";
					window.clearTimeout(resetTimer);
					resetTimer = window.setTimeout(() => {
						link.textContent = shown;
					}, 1400);
				})
				.catch(() => {
					// Clipboard blocked: select the text so it can be copied by hand.
					const range = document.createRange();
					range.selectNodeContents(link);
					const selection = window.getSelection();
					selection?.removeAllRanges();
					selection?.addRange(range);
				});
		},
		{ signal: events.signal },
	);
	return () => {
		events.abort();
		window.clearTimeout(resetTimer);
	};
}
