export interface PhotoGalleryPhoto {
	src: string;
	alt: string;
	caption?: string;
}

function parsePhotoGalleryPhotos(raw: string): PhotoGalleryPhoto[] {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(
			(item): item is PhotoGalleryPhoto =>
				typeof item === "object" &&
				item !== null &&
				typeof (item as Record<string, unknown>).src === "string" &&
				typeof (item as Record<string, unknown>).alt === "string",
		);
	} catch {
		return [];
	}
}

export function mountPhotoGalleries(root: ParentNode = document): () => void {
	const cleanups: Array<() => void> = [];
	const galleries = [...root.querySelectorAll<HTMLElement>("[data-photo-gallery]")];

	for (const gallery of galleries) {
		if (gallery.dataset.photoGalleryMounted === "true") continue;

		const dataEl = gallery.querySelector("script[data-photo-gallery-data]");
		const dialog = gallery.querySelector<HTMLDialogElement>("[data-photo-lightbox]");
		const img = gallery.querySelector<HTMLImageElement>("[data-photo-lightbox-img]");
		const caption = gallery.querySelector<HTMLElement>("[data-photo-lightbox-caption]");
		const counter = gallery.querySelector<HTMLElement>("[data-photo-lightbox-counter]");
		const closeBtn = gallery.querySelector<HTMLButtonElement>("[data-photo-lightbox-close]");
		const prevBtn = gallery.querySelector<HTMLButtonElement>("[data-photo-lightbox-prev]");
		const nextBtn = gallery.querySelector<HTMLButtonElement>("[data-photo-lightbox-next]");

		if (!dataEl || !dialog || !img || !caption || !counter || !closeBtn || !prevBtn || !nextBtn) {
			continue;
		}

		const raw = dataEl.textContent?.trim() ?? "";
		const photos: PhotoGalleryPhoto[] = raw ? parsePhotoGalleryPhotos(raw) : [];

		if (photos.length === 0) continue;

		// Capture non-null refs for use in closures (TS can't narrow across closure boundaries)
		const dlg = dialog;
		const lbImg = img;
		const lbCaption = caption;
		const lbCounter = counter;
		const btnPrev = prevBtn;
		const btnNext = nextBtn;

		gallery.dataset.photoGalleryMounted = "true";
		let currentIndex = 0;
		let lastTrigger: HTMLButtonElement | null = null;
		let touchStartX = 0;
		let touchStartY = 0;
		let savedBodyOverflow: string | null = null;
		const SWIPE_THRESHOLD = 50;

		const buttons = [...gallery.querySelectorAll<HTMLButtonElement>("[data-photo-index]")];

		function updateNav() {
			btnPrev.style.visibility = currentIndex === 0 ? "hidden" : "visible";
			btnNext.style.visibility = currentIndex === photos.length - 1 ? "hidden" : "visible";
		}

		function showPhoto(index: number) {
			currentIndex = index;
			const photo = photos[currentIndex];
			if (!photo) return;

			lbImg.style.opacity = "0";
			requestAnimationFrame(() => {
				lbImg.src = photo.src;
				lbImg.alt = photo.alt;
				lbCaption.textContent = photo.caption || "";
				lbCounter.textContent = `${currentIndex + 1} / ${photos.length}`;
				updateNav();

				const onLoad = () => {
					lbImg.style.opacity = "1";
				};
				lbImg.onerror = () => {
					lbImg.style.opacity = "1";
					lbImg.alt = "Image failed to load";
				};
				if (lbImg.complete && lbImg.src === photo.src) {
					onLoad();
				} else {
					lbImg.onload = onLoad;
				}
			});

			// Preload adjacent
			if (index > 0) new Image().src = photos[index - 1].src;
			if (index < photos.length - 1) new Image().src = photos[index + 1].src;
		}

		function goNext() {
			if (currentIndex < photos.length - 1) showPhoto(currentIndex + 1);
		}

		function goPrev() {
			if (currentIndex > 0) showPhoto(currentIndex - 1);
		}

		function openPhoto(btn: HTMLButtonElement) {
			const idx = Number.parseInt(btn.getAttribute("data-photo-index") || "0", 10);
			lastTrigger = btn;
			showPhoto(idx);
			dlg.showModal();
			const closeBtn = dlg.querySelector<HTMLButtonElement>("button[data-photo-lightbox-close]");
			closeBtn?.focus();
			if (savedBodyOverflow === null) {
				savedBodyOverflow = document.body.style.overflow;
			}
			document.body.style.overflow = "hidden";
		}

		function closeLightbox() {
			dlg.close();
		}

		// Grid button handlers
		const buttonHandlers = buttons.map((btn) => {
			const handler = () => openPhoto(btn);
			btn.addEventListener("click", handler);
			return { btn, handler };
		});

		// Navigation
		const onPrev = (e: Event) => {
			e.stopPropagation();
			goPrev();
		};
		const onNext = (e: Event) => {
			e.stopPropagation();
			goNext();
		};
		btnPrev.addEventListener("click", onPrev);
		btnNext.addEventListener("click", onNext);

		// Close
		const onCloseClick = () => closeLightbox();
		closeBtn.addEventListener("click", onCloseClick);

		const onDialogClick = (e: MouseEvent) => {
			if (!(e.target instanceof HTMLElement)) return;
			if (e.target === dlg || e.target.classList.contains("photo-lightbox-content")) {
				closeLightbox();
			}
		};
		dlg.addEventListener("click", onDialogClick);

		const onClose = () => {
			if (savedBodyOverflow !== null) {
				document.body.style.overflow = savedBodyOverflow;
				savedBodyOverflow = null;
			}
			lastTrigger?.focus();
			lastTrigger = null;
		};
		dlg.addEventListener("close", onClose);

		// Keyboard
		const onKeydown = (e: KeyboardEvent) => {
			if (!dlg.open) return;
			switch (e.key) {
				case "ArrowLeft":
					e.preventDefault();
					goPrev();
					break;
				case "ArrowRight":
					e.preventDefault();
					goNext();
					break;
				case "Escape":
					e.preventDefault();
					closeLightbox();
					break;
			}
		};
		document.addEventListener("keydown", onKeydown);

		// Touch swipe
		const onTouchStart = (e: TouchEvent) => {
			touchStartX = e.changedTouches[0].clientX;
			touchStartY = e.changedTouches[0].clientY;
		};
		const onTouchEnd = (e: TouchEvent) => {
			const dx = e.changedTouches[0].clientX - touchStartX;
			const dy = e.changedTouches[0].clientY - touchStartY;
			if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > SWIPE_THRESHOLD) {
				if (dx < 0) goNext();
				else goPrev();
			}
		};
		dlg.addEventListener("touchstart", onTouchStart, { passive: true });
		dlg.addEventListener("touchend", onTouchEnd, { passive: true });

		cleanups.push(() => {
			for (const { btn, handler } of buttonHandlers) {
				btn.removeEventListener("click", handler);
			}
			btnPrev.removeEventListener("click", onPrev);
			btnNext.removeEventListener("click", onNext);
			closeBtn.removeEventListener("click", onCloseClick);
			dlg.removeEventListener("click", onDialogClick);
			dlg.removeEventListener("close", onClose);
			dlg.removeEventListener("touchstart", onTouchStart);
			dlg.removeEventListener("touchend", onTouchEnd);
			document.removeEventListener("keydown", onKeydown);
			if (dlg.open) dlg.close();
			if (savedBodyOverflow !== null) {
				document.body.style.overflow = savedBodyOverflow;
				savedBodyOverflow = null;
			}
			delete gallery.dataset.photoGalleryMounted;
		});
	}

	return () => {
		for (const cleanup of cleanups) cleanup();
	};
}
