/**
 * Cloudinary Upload Widget for Sveltia CMS (Signed Uploads)
 *
 * Adds a floating "Upload to Cloudinary" button in the CMS.
 * Opens the Cloudinary Upload Widget with server-side signing —
 * the API secret never leaves the server.
 *
 * Signing is handled by /api/cloudinary-sign (Astro serverless endpoint).
 * Uploads are organised into per-collection/per-entry folders under "website/":
 *   website/photos/san-diego, website/books, website/blog, etc.
 *
 * For the photos collection, a bulk-insert panel lets you add all uploaded
 * images to the photos list at once instead of pasting URLs one by one.
 */
(function () {
	"use strict";

	const SIGN_ENDPOINT = "/api/cloudinary-sign";
	const ROOT_FOLDER = "website";

	// ── Collection & entry detection ────────────────────────────────────
	// Sveltia CMS hash routing:
	//   #/collections/<name>                     → collection list
	//   #/collections/<name>/entries/<slug>       → editing an entry
	//   #/collections/<name>/new                  → creating a new entry
	/** Sanitise a string for use as a Cloudinary folder segment.
	 *  Allows lowercase alphanumeric, hyphens, and underscores only. */
	function sanitizeFolder(name) {
		return name
			.toLowerCase()
			.replace(/[^a-z0-9_-]/g, "-") // replace unsafe chars with hyphens
			.replace(/-{2,}/g, "-") // collapse consecutive hyphens
			.replace(/^-|-$/g, ""); // trim leading/trailing hyphens
	}

	function detectCollection() {
		const match = window.location.hash.match(
			/^#\/collections\/([^/]+)/,
		);
		return match ? match[1] : null;
	}

	function detectEntrySlug() {
		const match = window.location.hash.match(
			/^#\/collections\/[^/]+\/entries\/([^/]+)/,
		);
		return match ? match[1] : null;
	}

	function getUploadFolder() {
		const collection = detectCollection();
		if (!collection) return ROOT_FOLDER;
		const safe = sanitizeFolder(collection);
		const slug = detectEntrySlug();
		if (slug) return `${ROOT_FOLDER}/${safe}/${sanitizeFolder(slug)}`;
		return `${ROOT_FOLDER}/${safe}`;
	}

	// ── Styles ──────────────────────────────────────────────────────────
	const style = document.createElement("style");
	style.textContent = /* css */ `
    #cloudinary-upload-toggle {
      position: fixed;
      bottom: 1.25rem;
      right: 5rem;
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
    #cloudinary-upload-toggle:hover { background: #446; }

    .cl-toast {
      position: fixed;
      bottom: 5.5rem;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10001;
      background: #36a;
      color: #fff;
      padding: .5rem 1.2rem;
      border-radius: 8px;
      font-size: .85rem;
      font-weight: 500;
      opacity: 0;
      transition: opacity .2s;
      pointer-events: none;
    }
    .cl-toast.show { opacity: 1; }

    #cloudinary-setup-notice {
      position: fixed;
      bottom: 4.75rem;
      right: 5rem;
      z-index: 10000;
      width: 350px;
      background: #1a1a2e;
      color: #e0e0e0;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,.5);
      padding: 1.2rem;
      font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
      font-size: .82rem;
      line-height: 1.5;
      display: none;
    }
    #cloudinary-setup-notice.open { display: block; }
    #cloudinary-setup-notice h3 {
      margin: 0 0 .5rem;
      font-size: .95rem;
      color: #fff;
    }
    #cloudinary-setup-notice code {
      background: #111;
      padding: .15rem .35rem;
      border-radius: 4px;
      font-size: .78rem;
    }
    #cloudinary-setup-notice ol {
      margin: .5rem 0;
      padding-left: 1.2rem;
    }
    #cloudinary-setup-notice a { color: #6af; }
    #cloudinary-setup-notice button {
      margin-top: .5rem;
      padding: .4rem .8rem;
      border: none;
      border-radius: 6px;
      background: #335;
      color: #fff;
      cursor: pointer;
      font-size: .8rem;
    }

    /* ── Bulk-insert panel ─────────────────────────────────────────── */
    #cl-bulk-panel {
      position: fixed;
      bottom: 4.75rem;
      right: 5rem;
      z-index: 10000;
      width: 380px;
      max-height: 70vh;
      background: #1a1a2e;
      color: #e0e0e0;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,.5);
      font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
      font-size: .82rem;
      line-height: 1.5;
      display: none;
      overflow: hidden;
    }
    #cl-bulk-panel.open { display: flex; flex-direction: column; }
    #cl-bulk-panel header {
      padding: .8rem 1rem;
      border-bottom: 1px solid #333;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    #cl-bulk-panel header h3 { margin: 0; font-size: .92rem; color: #fff; }
    #cl-bulk-panel .cl-bulk-close {
      background: none; border: none; color: #aaa;
      font-size: 1.1rem; cursor: pointer; padding: 0 .3rem;
    }
    #cl-bulk-panel .cl-bulk-close:hover { color: #fff; }
    #cl-bulk-panel .cl-bulk-list {
      flex: 1;
      overflow-y: auto;
      padding: .5rem 1rem;
    }
    #cl-bulk-panel .cl-bulk-item {
      display: flex;
      align-items: center;
      gap: .6rem;
      padding: .4rem 0;
      border-bottom: 1px solid #2a2a3e;
    }
    #cl-bulk-panel .cl-bulk-item img {
      width: 48px;
      height: 48px;
      object-fit: cover;
      border-radius: 4px;
      flex-shrink: 0;
    }
    #cl-bulk-panel .cl-bulk-item .cl-bulk-url {
      flex: 1;
      font-size: .72rem;
      color: #8af;
      word-break: break-all;
    }
    #cl-bulk-panel .cl-bulk-item .cl-bulk-copy {
      background: none; border: 1px solid #555; color: #ccc;
      border-radius: 4px; padding: .2rem .5rem; cursor: pointer;
      font-size: .72rem; flex-shrink: 0;
    }
    #cl-bulk-panel .cl-bulk-item .cl-bulk-copy:hover {
      background: #335; color: #fff;
    }
    #cl-bulk-panel footer {
      padding: .6rem 1rem;
      border-top: 1px solid #333;
      display: flex;
      flex-wrap: wrap;
      gap: .4rem;
    }
    #cl-bulk-panel footer button {
      padding: .45rem .8rem;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: .78rem;
      font-weight: 500;
    }
    #cl-bulk-panel .cl-bulk-primary {
      background: #36a; color: #fff;
    }
    #cl-bulk-panel .cl-bulk-primary:hover { background: #47b; }
    #cl-bulk-panel .cl-bulk-secondary {
      background: #335; color: #ddd;
    }
    #cl-bulk-panel .cl-bulk-secondary:hover { background: #446; }
  `;
	document.head.appendChild(style);

	// ── Load Cloudinary Upload Widget ────────────────────────────────────
	const widgetScript = document.createElement("script");
	widgetScript.src =
		"https://upload-widget.cloudinary.com/latest/global/all.js";
	document.head.appendChild(widgetScript);

	// ── DOM ──────────────────────────────────────────────────────────────
	const toggle = document.createElement("button");
	toggle.id = "cloudinary-upload-toggle";
	toggle.title = "Upload to Cloudinary";
	toggle.textContent = "☁️";
	document.body.appendChild(toggle);

	const clToast = document.createElement("div");
	clToast.className = "cl-toast";
	document.body.appendChild(clToast);

	const notice = document.createElement("div");
	notice.id = "cloudinary-setup-notice";
	notice.innerHTML = `
    <h3>Cloudinary Setup Required</h3>
    <p>Add these environment variables in <strong>Vercel &rarr; Settings &rarr; Environment Variables</strong>:</p>
    <ol>
      <li><code>CLOUDINARY_CLOUD_NAME</code></li>
      <li><code>CLOUDINARY_API_KEY</code></li>
      <li><code>CLOUDINARY_API_SECRET</code></li>
    </ol>
    <p>Find them in your <a href="https://console.cloudinary.com/settings/api-keys" target="_blank" rel="noopener">Cloudinary dashboard &rarr; API Keys</a>.</p>
    <p>Then redeploy.</p>
    <button id="cl-notice-close">Got it</button>
  `;
	document.body.appendChild(notice);

	document
		.getElementById("cl-notice-close")
		.addEventListener("click", () => notice.classList.remove("open"));

	// Close this notice when another CMS panel opens
	window.addEventListener("cms-panel-open", (e) => {
		if (e.detail !== "cloudinary") {
			notice.classList.remove("open");
			closeBulkPanel();
		}
	});

	// ── Bulk-insert panel DOM ───────────────────────────────────────────
	const bulkPanel = document.createElement("div");
	bulkPanel.id = "cl-bulk-panel";
	bulkPanel.innerHTML = `
    <header>
      <h3>Uploaded Images</h3>
      <button class="cl-bulk-close">&times;</button>
    </header>
    <div class="cl-bulk-list"></div>
    <footer>
      <button class="cl-bulk-primary" id="cl-bulk-add-all">
        Add all to Photos list
      </button>
      <button class="cl-bulk-secondary" id="cl-bulk-copy-all">
        Copy all URLs
      </button>
    </footer>
  `;
	document.body.appendChild(bulkPanel);

	const bulkList = bulkPanel.querySelector(".cl-bulk-list");
	const bulkAddAll = document.getElementById("cl-bulk-add-all");
	const bulkCopyAll = document.getElementById("cl-bulk-copy-all");

	bulkPanel
		.querySelector(".cl-bulk-close")
		.addEventListener("click", closeBulkPanel);
	bulkCopyAll.addEventListener("click", () => {
		navigator.clipboard.writeText(sessionUrls.join("\n")).then(
			() => showClToast("All URLs copied!"),
			() => showClToast("Copy failed"),
		);
	});
	bulkAddAll.addEventListener("click", () => {
		bulkInsertPhotos(sessionUrls);
	});

	function closeBulkPanel() {
		bulkPanel.classList.remove("open");
	}

	function showBulkPanel(urls) {
		const isPhotos = detectCollection() === "photos";

		bulkList.innerHTML = "";
		for (const url of urls) {
			const item = document.createElement("div");
			item.className = "cl-bulk-item";
			item.innerHTML = `
        <img src="${url}" alt="uploaded" />
        <span class="cl-bulk-url">${url.split("/").pop()}</span>
        <button class="cl-bulk-copy">Copy</button>
      `;
			item.querySelector(".cl-bulk-copy").addEventListener("click", () => {
				navigator.clipboard.writeText(url).then(
					() => showClToast("URL copied!"),
					() => showClToast("Copy failed"),
				);
			});
			bulkList.appendChild(item);
		}

		// Show/hide the "Add all to Photos list" button depending on collection
		bulkAddAll.style.display = isPhotos ? "" : "none";

		window.dispatchEvent(
			new CustomEvent("cms-panel-open", { detail: "cloudinary" }),
		);
		bulkPanel.classList.add("open");
	}

	// ── Bulk-insert into Photos list widget ─────────────────────────────
	// Sveltia CMS renders list widgets in the regular DOM. We find the
	// Photos list's "Add" button, click it for each URL, then fill in
	// the newly created entry's image field.

	function sleep(ms) {
		return new Promise((r) => setTimeout(r, ms));
	}

	async function bulkInsertPhotos(urls) {
		if (!urls.length) return;

		// Find the "Add" button for the photos list widget.
		// Sveltia CMS renders list items inside a fieldset whose legend
		// or label says "Photos". The add button is typically a button
		// with "Add" text or a "+" icon inside or near that fieldset.
		const addButton = findPhotosAddButton();
		if (!addButton) {
			// Fallback: copy YAML to clipboard so user can paste into raw editor
			copyAsYaml(urls);
			return;
		}

		showClToast(`Adding ${urls.length} photos...`, 5000);
		let added = 0;

		for (const url of urls) {
			addButton.click();
			await sleep(200);

			// Find the last/newest empty image field and fill it
			const filled = fillLastEmptyImageField(url);
			if (filled) added++;
			await sleep(100);
		}

		if (added > 0) {
			showClToast(
				`Added ${added} photo(s)! Fill in alt text, then save.`,
				5000,
			);
			closeBulkPanel();
		} else {
			copyAsYaml(urls);
		}
	}

	function findPhotosAddButton() {
		// Strategy: look for a label/legend containing "Photos" and find
		// the nearest "Add" button within the same container.
		const labels = document.querySelectorAll(
			"label, legend, span, h2, h3, h4",
		);
		for (const label of labels) {
			const text = label.textContent.trim();
			if (text !== "Photos") continue;

			// Walk up to find the field group container
			let container = label.closest(
				"fieldset, [class*='field'], [class*='list'], [role='group']",
			);
			if (!container) container = label.parentElement?.parentElement;
			if (!container) continue;

			// Look for an "Add" button
			const buttons = container.querySelectorAll("button");
			for (const btn of buttons) {
				const btnText = btn.textContent.trim().toLowerCase();
				if (
					btnText === "add" ||
					btnText === "+" ||
					btnText.includes("add")
				) {
					return btn;
				}
			}
		}
		return null;
	}

	function fillLastEmptyImageField(url) {
		// After clicking "Add", a new list item appears with an empty
		// image/src field. Find all image inputs (type=text or url with
		// relevant name/label) and fill the last empty one.
		const inputs = document.querySelectorAll(
			'input[type="text"], input[type="url"], input:not([type])',
		);

		// Collect inputs that look like image/src fields and are empty
		const candidates = [];
		for (const input of inputs) {
			if (input.value) continue;
			const name = (input.name || "").toLowerCase();
			const placeholder = (input.placeholder || "").toLowerCase();
			const label = findLabelFor(input);

			if (
				name.includes("src") ||
				name.includes("image") ||
				placeholder.includes("src") ||
				placeholder.includes("image") ||
				placeholder.includes("url") ||
				label === "image" ||
				label === "src"
			) {
				candidates.push(input);
			}
		}

		if (candidates.length === 0) {
			// Broader fallback: any empty text input inside a recently added list item
			const allInputs = document.querySelectorAll(
				'input[type="text"], input:not([type])',
			);
			for (const input of [...allInputs].reverse()) {
				if (!input.value) {
					candidates.push(input);
					break;
				}
			}
		}

		if (candidates.length === 0) return false;

		const target = candidates[candidates.length - 1];
		setNativeValue(target, url);
		return true;
	}

	function findLabelFor(input) {
		// Check for a <label> that references this input, or a nearby label
		if (input.id) {
			const label = document.querySelector(`label[for="${input.id}"]`);
			if (label) return label.textContent.trim().toLowerCase();
		}
		const parent = input.closest("label, [class*='field']");
		if (parent) {
			const labelEl = parent.querySelector("label, legend, span");
			if (labelEl && labelEl !== input) {
				return labelEl.textContent.trim().toLowerCase();
			}
		}
		return "";
	}

	function setNativeValue(input, value) {
		// Set value in a way that React/Svelte/framework reactivity picks up
		const nativeSet = Object.getOwnPropertyDescriptor(
			HTMLInputElement.prototype,
			"value",
		)?.set;
		if (nativeSet) {
			nativeSet.call(input, value);
		} else {
			input.value = value;
		}
		input.dispatchEvent(new Event("input", { bubbles: true }));
		input.dispatchEvent(new Event("change", { bubbles: true }));
	}

	function copyAsYaml(urls) {
		const yaml = urls
			.map(
				(url) =>
					`  - src: ${url}\n    alt: \"\"\n    caption: \"\"`,
			)
			.join("\n");
		navigator.clipboard.writeText(yaml).then(
			() =>
				showClToast(
					"Couldn't auto-insert — YAML copied to clipboard instead. Paste into raw editor.",
					6000,
				),
			() => showClToast("Copy failed", 3000),
		);
	}

	// ── Logic ─────────────────────────────────────────────────────────
	function showClToast(msg, ms = 3000) {
		clToast.textContent = msg;
		clToast.classList.add("show");
		setTimeout(() => clToast.classList.remove("show"), ms);
	}

	// Track URLs uploaded in the current widget session
	let sessionUrls = [];

	async function openWidget() {
		if (
			typeof cloudinary === "undefined" ||
			!cloudinary.createUploadWidget
		) {
			showClToast(
				"Cloudinary widget still loading, try again in a moment.",
			);
			return;
		}

		const folder = getUploadFolder();

		// Preflight — get cloudName, apiKey, folder from the server
		let config;
		try {
			const res = await fetch(SIGN_ENDPOINT, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ folder }),
			});
			config = await res.json();
			if (config.error) {
				if (config.error.includes("Missing env var")) {
					window.dispatchEvent(
						new CustomEvent("cms-panel-open", {
							detail: "cloudinary",
						}),
					);
					notice.classList.add("open");
				} else {
					showClToast(`Signing error: ${config.error}`);
				}
				return;
			}
		} catch (err) {
			showClToast(
				"Could not reach signing endpoint. Is the site deployed?",
			);
			return;
		}

		sessionUrls = [];

		const widget = cloudinary.createUploadWidget(
			{
				cloudName: config.cloudName,
				apiKey: config.apiKey,
				// Dynamic signing callback — the widget calls this per file
				// with the exact params it needs signed (including public_id,
				// source, etc.), so the signature always matches.
				uploadSignature: (callback, paramsToSign) => {
					fetch(SIGN_ENDPOINT, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ params_to_sign: paramsToSign }),
					})
						.then((r) => r.json())
						.then((d) => callback(d.signature))
						.catch(() =>
							showClToast(
								"Signing failed — check server logs.",
							),
						);
				},
				folder: config.folder,
				sources: ["local", "url", "camera"],
				multiple: true,
				maxFiles: 30,
				resourceType: "image",
				clientAllowedFormats: [
					"jpg",
					"jpeg",
					"png",
					"gif",
					"webp",
					"avif",
					"svg",
				],
				showPoweredBy: false,
				theme: "minimal",
			},
			(error, result) => {
				if (error) {
					showClToast(
						`Upload error: ${error.statusText || error.message || "unknown"}`,
					);
					return;
				}
				if (result.event === "success") {
					const url = result.info.secure_url;
					sessionUrls.push(url);
					showClToast(
						`Uploaded ${sessionUrls.length} image(s)`,
					);
				}
				if (result.event === "close" && sessionUrls.length > 0) {
					showBulkPanel(sessionUrls);
				}
			},
		);

		widget.open();
	}

	toggle.addEventListener("click", openWidget);
})();
