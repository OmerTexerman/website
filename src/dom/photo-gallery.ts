export interface PhotoGalleryPhoto {
	src: string;
	alt: string;
	caption?: string;
}

export function mountPhotoGalleries(root: ParentNode = document): () => void {
	const cleanups: Array<() => void> = [];
	const galleries = [...root.querySelectorAll<HTMLElement>("[data-photo-gallery]")];

	for (const gallery of galleries) {
		if (gallery.dataset.photoGalleryMounted === "true") continue;

		const dataEl = gallery.querySelector("template[data-photo-gallery-data]");
		const dialog = gallery.querySelector("[data-photo-lightbox]");
		const img = gallery.querySelector("[data-photo-lightbox-img]");
		const caption = gallery.querySelector("[data-photo-lightbox-caption]");
		const closeBtn = gallery.querySelector("[data-photo-lightbox-close]");

		if (
			!(dataEl instanceof HTMLTemplateElement) ||
			!(dialog instanceof HTMLDialogElement) ||
			!(img instanceof HTMLImageElement) ||
			!(caption instanceof HTMLElement) ||
			!(closeBtn instanceof HTMLButtonElement)
		) {
			continue;
		}

		let photos: PhotoGalleryPhoto[] = [];
		try {
			const raw = dataEl.textContent?.trim() ?? "";
			photos = raw ? (JSON.parse(raw) as PhotoGalleryPhoto[]) : [];
		} catch {
			continue;
		}

		gallery.dataset.photoGalleryMounted = "true";
		let lastTrigger: HTMLButtonElement | null = null;
		const buttons = [...gallery.querySelectorAll<HTMLButtonElement>("[data-photo-index]")];

		const openPhoto = (btn: HTMLButtonElement) => {
			const idx = Number.parseInt(btn.getAttribute("data-photo-index") || "0", 10);
			const photo = photos[idx];
			if (!photo) return;

			img.src = photo.src;
			img.alt = photo.alt;
			caption.textContent = photo.caption || "";
			lastTrigger = btn;
			dialog.showModal();
		};

		const buttonHandlers = buttons.map((btn) => {
			const handler = () => openPhoto(btn);
			btn.addEventListener("click", handler);
			return { btn, handler };
		});

		const onCloseClick = () => dialog.close();
		const onBackdropClick = (event: MouseEvent) => {
			if (event.target === dialog) dialog.close();
		};
		const onClose = () => {
			lastTrigger?.focus();
			lastTrigger = null;
		};

		closeBtn.addEventListener("click", onCloseClick);
		dialog.addEventListener("click", onBackdropClick);
		dialog.addEventListener("close", onClose);

		cleanups.push(() => {
			for (const { btn, handler } of buttonHandlers) {
				btn.removeEventListener("click", handler);
			}
			if (dialog.open) dialog.close();
			closeBtn.removeEventListener("click", onCloseClick);
			dialog.removeEventListener("click", onBackdropClick);
			dialog.removeEventListener("close", onClose);
			delete gallery.dataset.photoGalleryMounted;
		});
	}

	return () => {
		for (const cleanup of cleanups) cleanup();
	};
}
