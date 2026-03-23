/**
 * Cover Auto-Suggest for Sveltia CMS
 *
 * Adds a floating panel to search Open Library for book covers by title/author.
 * Click a cover to copy its URL, then paste it into the Cover Image field.
 */
(function () {
	"use strict";

	const OPEN_LIBRARY_SEARCH = "https://openlibrary.org/search.json";
	const OPEN_LIBRARY_COVER = "https://covers.openlibrary.org/b/olid";

	// ── Styles ──────────────────────────────────────────────────────────
	const style = document.createElement("style");
	style.textContent = /* css */ `
    #cover-suggest-toggle {
      position: fixed;
      bottom: 1.25rem;
      right: 1.25rem;
      z-index: 10000;
      width: 3rem;
      height: 3rem;
      border-radius: 50%;
      border: none;
      background: #335;
      color: #fff;
      font-size: 1.4rem;
      cursor: pointer;
      box-shadow: 0 2px 10px rgba(0,0,0,.35);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background .15s;
    }
    #cover-suggest-toggle:hover { background: #446; }

    #cover-suggest-panel {
      position: fixed;
      bottom: 4.75rem;
      right: 1.25rem;
      z-index: 10000;
      width: 380px;
      max-height: 520px;
      background: #1a1a2e;
      color: #e0e0e0;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,.5);
      display: none;
      flex-direction: column;
      overflow: hidden;
      font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
    }
    #cover-suggest-panel.open { display: flex; }

    #cover-suggest-panel header {
      padding: .75rem 1rem;
      background: #16213e;
      font-weight: 600;
      font-size: .9rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    #cover-suggest-panel header button {
      background: none;
      border: none;
      color: #aaa;
      cursor: pointer;
      font-size: 1.1rem;
    }

    .cs-form {
      padding: .75rem 1rem;
      display: flex;
      flex-direction: column;
      gap: .5rem;
      border-bottom: 1px solid #2a2a4a;
    }
    .cs-form input {
      padding: .45rem .6rem;
      border-radius: 6px;
      border: 1px solid #333;
      background: #111;
      color: #ddd;
      font-size: .85rem;
    }
    .cs-form input:focus {
      outline: none;
      border-color: #557;
    }
    .cs-form button {
      padding: .45rem .6rem;
      border-radius: 6px;
      border: none;
      background: #335;
      color: #fff;
      font-size: .85rem;
      cursor: pointer;
      font-weight: 500;
    }
    .cs-form button:hover { background: #446; }
    .cs-form button:disabled { opacity: .5; cursor: wait; }

    .cs-results {
      padding: .75rem 1rem;
      overflow-y: auto;
      flex: 1;
    }
    .cs-results-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: .6rem;
    }
    .cs-cover-option {
      cursor: pointer;
      border-radius: 6px;
      overflow: hidden;
      border: 2px solid transparent;
      transition: border-color .15s, transform .1s;
      position: relative;
      background: #111;
    }
    .cs-cover-option:hover {
      border-color: #6a8;
      transform: scale(1.03);
    }
    .cs-cover-option img {
      width: 100%;
      aspect-ratio: 2/3;
      object-fit: cover;
      display: block;
    }
    .cs-cover-option .cs-edition {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      background: rgba(0,0,0,.75);
      color: #ccc;
      font-size: .6rem;
      padding: .2rem .35rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .cs-status {
      text-align: center;
      color: #888;
      font-size: .8rem;
      padding: 1.5rem 0;
    }

    .cs-toast {
      position: fixed;
      bottom: 5.5rem;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10001;
      background: #2a6;
      color: #fff;
      padding: .5rem 1.2rem;
      border-radius: 8px;
      font-size: .85rem;
      font-weight: 500;
      opacity: 0;
      transition: opacity .2s;
      pointer-events: none;
    }
    .cs-toast.show { opacity: 1; }
  `;
	document.head.appendChild(style);

	// ── DOM ──────────────────────────────────────────────────────────────
	const toggle = document.createElement("button");
	toggle.id = "cover-suggest-toggle";
	toggle.title = "Book Cover Search";
	toggle.textContent = "📚";
	document.body.appendChild(toggle);

	const panel = document.createElement("div");
	panel.id = "cover-suggest-panel";
	panel.innerHTML = `
    <header>
      <span>Book Cover Search</span>
      <button id="cs-close" title="Close">&times;</button>
    </header>
    <div class="cs-form">
      <input type="text" id="cs-title" placeholder="Book title" />
      <input type="text" id="cs-author" placeholder="Author (optional)" />
      <button id="cs-search">Search Covers</button>
    </div>
    <div class="cs-results">
      <div class="cs-status">Enter a title and search to find covers.</div>
    </div>
  `;
	document.body.appendChild(panel);

	const toast = document.createElement("div");
	toast.className = "cs-toast";
	document.body.appendChild(toast);

	// ── Logic ─────────────────────────────────────────────────────────
	const titleInput = document.getElementById("cs-title");
	const authorInput = document.getElementById("cs-author");
	const searchBtn = document.getElementById("cs-search");
	const results = panel.querySelector(".cs-results");

	toggle.addEventListener("click", () => {
		panel.classList.toggle("open");
	});
	document.getElementById("cs-close").addEventListener("click", () => {
		panel.classList.remove("open");
	});

	function showToast(msg, ms = 2000) {
		toast.textContent = msg;
		toast.classList.add("show");
		setTimeout(() => toast.classList.remove("show"), ms);
	}

	async function searchCovers() {
		const title = titleInput.value.trim();
		if (!title) return;

		const author = authorInput.value.trim();
		searchBtn.disabled = true;
		results.innerHTML = '<div class="cs-status">Searching…</div>';

		const params = new URLSearchParams({
			title,
			fields: "key,title,author_name,cover_edition_key,edition_key,isbn",
			limit: "20",
		});
		if (author) params.set("author", author);

		try {
			const res = await fetch(`${OPEN_LIBRARY_SEARCH}?${params}`);
			const data = await res.json();

			if (!data.docs || data.docs.length === 0) {
				results.innerHTML =
					'<div class="cs-status">No results found. Try a different search.</div>';
				return;
			}

			// Collect all covers: prefer cover_edition_key, fall back to first edition, plus ISBN covers
			const covers = [];
			for (const doc of data.docs) {
				const authorStr = doc.author_name
					? doc.author_name.join(", ")
					: "Unknown";

				// OLID-based covers
				const olids = [];
				if (doc.cover_edition_key) olids.push(doc.cover_edition_key);
				if (doc.edition_key) {
					for (const ek of doc.edition_key.slice(0, 3)) {
						if (!olids.includes(ek)) olids.push(ek);
					}
				}
				for (const olid of olids) {
					covers.push({
						thumb: `${OPEN_LIBRARY_COVER}/${olid}-M.jpg`,
						full: `${OPEN_LIBRARY_COVER}/${olid}-L.jpg`,
						label: `${doc.title} — ${authorStr}`,
					});
				}

				// ISBN-based covers (often higher quality)
				if (doc.isbn) {
					for (const isbn of doc.isbn.slice(0, 2)) {
						covers.push({
							thumb: `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`,
							full: `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`,
							label: `${doc.title} — ${authorStr} (ISBN ${isbn})`,
						});
					}
				}

				if (covers.length >= 18) break;
			}

			if (covers.length === 0) {
				results.innerHTML =
					'<div class="cs-status">Found books but no cover images available.</div>';
				return;
			}

			const grid = document.createElement("div");
			grid.className = "cs-results-grid";

			for (const cover of covers) {
				const card = document.createElement("div");
				card.className = "cs-cover-option";
				card.title = `${cover.label}\nClick to copy URL`;

				const img = document.createElement("img");
				img.src = cover.thumb;
				img.alt = cover.label;
				img.loading = "lazy";
				// Remove broken images
				img.addEventListener("error", () => card.remove());

				const edition = document.createElement("div");
				edition.className = "cs-edition";
				edition.textContent = cover.label;

				card.appendChild(img);
				card.appendChild(edition);
				card.addEventListener("click", () => copyUrl(cover.full));
				grid.appendChild(card);
			}

			results.innerHTML = "";
			results.appendChild(grid);
		} catch (err) {
			results.innerHTML = `<div class="cs-status">Search failed: ${err.message}</div>`;
		} finally {
			searchBtn.disabled = false;
		}
	}

	async function copyUrl(url) {
		try {
			await navigator.clipboard.writeText(url);
			showToast("Cover URL copied! Paste into the Cover Image field.");
		} catch {
			// Fallback for older browsers
			const ta = document.createElement("textarea");
			ta.value = url;
			ta.style.position = "fixed";
			ta.style.opacity = "0";
			document.body.appendChild(ta);
			ta.select();
			document.execCommand("copy");
			document.body.removeChild(ta);
			showToast("Cover URL copied! Paste into the Cover Image field.");
		}
	}

	searchBtn.addEventListener("click", searchCovers);
	titleInput.addEventListener("keydown", (e) => {
		if (e.key === "Enter") searchCovers();
	});
	authorInput.addEventListener("keydown", (e) => {
		if (e.key === "Enter") searchCovers();
	});
})();
