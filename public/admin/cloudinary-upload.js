/**
 * Cloudinary Upload Widget for Sveltia CMS
 *
 * Adds a floating "Upload to Cloudinary" button in the CMS.
 * Opens the Cloudinary Upload Widget, uploads the image, and copies
 * the resulting URL so you can paste it into any image field.
 *
 * Configuration is read from window.__cmsCloudinary, set by index.html
 * from environment variables injected at build time.
 *
 * Uploads are organised into per-collection folders under "website/":
 *   website/books, website/photos, website/blog, etc.
 * The active collection is detected from the CMS URL hash.
 */
(function () {
	"use strict";

	const cfg = window.__cmsCloudinary || {};
	const CLOUD_NAME = cfg.cloudName || "";
	const UPLOAD_PRESET = cfg.uploadPreset || "cms_unsigned";
	const ROOT_FOLDER = cfg.rootFolder || "website";

	// ── Collection folder detection ─────────────────────────────────────
	// Sveltia CMS uses hash-based routing: #/collections/<name>/...
	function detectCollection() {
		const match = window.location.hash.match(
			/^#\/collections\/([^/]+)/,
		);
		return match ? match[1] : null;
	}

	function getUploadFolder() {
		const collection = detectCollection();
		return collection ? `${ROOT_FOLDER}/${collection}` : ROOT_FOLDER;
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
      right: 1.25rem;
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
	document.body.appendChild(notice);

	function renderNotice() {
		notice.innerHTML = `
      <h3>Cloudinary Setup</h3>
      ${
				!CLOUD_NAME
					? `<p>⚠️ <strong>Cloud name not configured.</strong></p>
           <p>Set <code>CLOUDINARY_CLOUD_NAME</code> in your environment
           (Vercel &rarr; Settings &rarr; Environment Variables) and redeploy.</p>`
					: `<p>To enable uploads, create an <strong>unsigned upload preset</strong>:</p>
           <ol>
             <li>Go to <a href="https://console.cloudinary.com/settings/upload" target="_blank" rel="noopener">Cloudinary Settings &rarr; Upload</a></li>
             <li>Click <strong>Add upload preset</strong></li>
             <li>Set name to <code>${UPLOAD_PRESET}</code></li>
             <li>Set signing mode to <strong>Unsigned</strong></li>
             <li>Save and reload this page</li>
           </ol>
           <p>Cloud: <code>${CLOUD_NAME}</code></p>`
			}
      <button id="cl-notice-close">Got it</button>
    `;
		notice
			.querySelector("#cl-notice-close")
			.addEventListener("click", () => notice.classList.remove("open"));
	}
	renderNotice();

	// ── Logic ─────────────────────────────────────────────────────────
	function showClToast(msg, ms = 3000) {
		clToast.textContent = msg;
		clToast.classList.add("show");
		setTimeout(() => clToast.classList.remove("show"), ms);
	}

	function openWidget() {
		if (!CLOUD_NAME) {
			notice.classList.add("open");
			return;
		}

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

		const widget = cloudinary.createUploadWidget(
			{
				cloudName: CLOUD_NAME,
				uploadPreset: UPLOAD_PRESET,
				folder,
				sources: ["local", "url", "camera"],
				multiple: true,
				maxFiles: 10,
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
					if (
						error.statusText &&
						error.statusText.includes("unknown preset")
					) {
						notice.classList.add("open");
					} else {
						showClToast(
							`Upload error: ${error.statusText || error.message || "unknown"}`,
						);
					}
					return;
				}
				if (result.event === "success") {
					const url = result.info.secure_url;
					navigator.clipboard.writeText(url).then(
						() =>
							showClToast(
								`Uploaded to ${folder}/ — URL copied!`,
							),
						() => showClToast(`Uploaded: ${url}`, 5000),
					);
				}
			},
		);

		widget.open();
	}

	toggle.addEventListener("click", openWidget);
})();
