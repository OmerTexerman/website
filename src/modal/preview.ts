import { getSameOriginUrl, isSafeHttpUrl, toRelativeHref } from "../url-utils";

export type ContentPreviewResult =
	| { kind: "content"; html: string }
	| { kind: "message"; message: string };

const previewCache = new Map<string, ContentPreviewResult>();

export async function loadContentPreview(
	href: string,
	signal: AbortSignal,
): Promise<ContentPreviewResult> {
	const cached = previewCache.get(href);
	if (cached !== undefined) {
		return cached;
	}

	const url = getSameOriginUrl(href);
	if (!url) {
		return { kind: "message", message: "External preview is blocked." };
	}

	const response = await fetch(url.toString(), { signal });
	if (!response.ok) {
		throw new Error(`Could not load preview: ${response.status}`);
	}

	const html = await response.text();
	const doc = new DOMParser().parseFromString(html, "text/html");
	const content =
		doc.querySelector("[data-preview-content]") ||
		doc.querySelector(".content-surface") ||
		doc.querySelector("main");

	if (!content) {
		const result: ContentPreviewResult = { kind: "message", message: "No content found." };
		previewCache.set(href, result);
		return result;
	}

	const sanitized = content.cloneNode(true) as Element;
	sanitizeNode(sanitized, url.toString());
	// Store serialized HTML so each open gets fresh nodes rather than re-using
	// live DOM nodes that were transferred to the modal body on the first open.
	const result: ContentPreviewResult = { kind: "content", html: sanitized.innerHTML };
	previewCache.set(href, result);
	return result;
}

function isSafeAssetUrl(value: string, baseUrl: string): boolean {
	if (!value) return false;
	return isSafeHttpUrl(value, baseUrl);
}

function normalizeSameOriginUrl(value: string, baseUrl: string): string | null {
	const url = getSameOriginUrl(value, baseUrl);
	return url ? toRelativeHref(url) : null;
}

function normalizeHttpUrl(value: string, baseUrl: string): string | null {
	if (!isSafeAssetUrl(value, baseUrl)) return null;
	try {
		return new URL(value, baseUrl).href;
	} catch {
		return null;
	}
}

/** HTML `rel` is a space-separated token list; `includes("noop")` is spoofable (e.g. `xnoopenerx`). */
function relTokenListIncludes(rel: string | null, token: string): boolean {
	if (!rel) return false;
	const lower = token.toLowerCase();
	return rel
		.split(/\s+/)
		.filter(Boolean)
		.some((t) => t.toLowerCase() === lower);
}

/** `target="_blank"` plus `noopener` or `noreferrer` (implies noopener for new browsing contexts). */
function isBlankTargetExternalLink(el: Element, attrName: string): boolean {
	if (attrName !== "href" || !(el instanceof HTMLAnchorElement)) return false;
	if (el.getAttribute("target") !== "_blank") return false;
	const relAttr = el.getAttribute("rel");
	return relTokenListIncludes(relAttr, "noopener") || relTokenListIncludes(relAttr, "noreferrer");
}

function sanitizeSrcset(value: string, baseUrl: string, allowExternal: boolean): string | null {
	const entries = value
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean);
	const safeEntries = entries.flatMap((entry) => {
		const [url, ...descriptor] = entry.split(/\s+/);
		const normalizedUrl = allowExternal
			? normalizeHttpUrl(url, baseUrl)
			: normalizeSameOriginUrl(url, baseUrl);
		if (!normalizedUrl) return [];
		return [`${normalizedUrl}${descriptor.length > 0 ? ` ${descriptor.join(" ")}` : ""}`];
	});

	return safeEntries.length > 0 ? safeEntries.join(", ") : null;
}

function sanitizeNode(root: Element, baseUrl: string): void {
	root
		.querySelectorAll(
			"script,style,iframe,object,embed,form,link,meta,noscript,video,audio,source,track,dialog,template,svg,math,base",
		)
		.forEach((el) => {
			el.remove();
		});

	root.querySelectorAll("*").forEach((el) => {
		for (const attr of [...el.attributes]) {
			const name = attr.name.toLowerCase();
			const value = attr.value.trim();
			const allowExternalAsset =
				(name === "src" || name === "srcset" || name === "poster") &&
				el instanceof HTMLImageElement;

			if (name === "style") {
				el.removeAttribute(attr.name);
			} else if (name.startsWith("on")) {
				el.removeAttribute(attr.name);
			} else if (name === "srcset") {
				const safeSrcset = sanitizeSrcset(value, baseUrl, allowExternalAsset);
				if (safeSrcset) el.setAttribute(attr.name, safeSrcset);
				else el.removeAttribute(attr.name);
			} else if (name === "href" || name === "src" || name === "poster" || name === "xlink:href") {
				// Allow external hrefs on links that open in new tabs (e.g. project repo/live links)
				const isExternalLink = isBlankTargetExternalLink(el, name);
				const normalizedUrl =
					allowExternalAsset || isExternalLink
						? normalizeHttpUrl(value, baseUrl)
						: normalizeSameOriginUrl(value, baseUrl);
				if (normalizedUrl) el.setAttribute(attr.name, normalizedUrl);
				else el.removeAttribute(attr.name);
			} else if (name === "autofocus") {
				el.removeAttribute(attr.name);
			}
		}
	});
}
