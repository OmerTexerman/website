/**
 * The about card's email link. The address is stored in two halves so it
 * never appears in the page for scrapers; it is put together only when
 * someone clicks, then opens their mail app and shows the address.
 *
 * Mounted on the /about page and again whenever the content modal renders
 * it (the modal preview runs no scripts).
 */
export function mountAboutCard(root: ParentNode = document): () => void {
	const link = root.querySelector<HTMLAnchorElement>("[data-email-user]");
	if (!link) return () => {};

	const events = new AbortController();
	link.addEventListener(
		"click",
		(event) => {
			const { emailUser, emailDomain } = link.dataset;
			if (!emailUser || !emailDomain) return;
			event.preventDefault();
			const address = `${emailUser}@${emailDomain}`;
			link.href = `mailto:${address}`;
			link.textContent = address;
			window.location.href = link.href;
		},
		{ signal: events.signal },
	);
	return () => events.abort();
}
