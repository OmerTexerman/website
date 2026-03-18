import { getSameOriginUrl, isSafeHttpUrl } from "../url-utils";

export type ContentPreviewResult =
	| { kind: "content"; nodes: ChildNode[] }
	| { kind: "message"; message: string };

export async function loadContentPreview(
	href: string,
	signal: AbortSignal,
): Promise<ContentPreviewResult> {
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
		return { kind: "message", message: "No content found." };
	}

	const sanitized = content.cloneNode(true) as Element;
	sanitizeNode(sanitized, url.toString());
	return { kind: "content", nodes: Array.from(sanitized.childNodes) };
}

function isSafeSameOriginUrl(value: string, baseUrl: string): boolean {
	if (!value) return false;
	if (value.startsWith("#")) return true;
	return getSameOriginUrl(value, baseUrl) !== null;
}

function isSafeAssetUrl(value: string, baseUrl: string): boolean {
	if (!value) return false;
	return isSafeHttpUrl(value, baseUrl);
}

function sanitizeSrcset(value: string, baseUrl: string, allowExternal: boolean): string | null {
	const entries = value
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean);
	const safeEntries = entries.flatMap((entry) => {
		const [url, ...descriptor] = entry.split(/\s+/);
		const isSafe = allowExternal ? isSafeAssetUrl(url, baseUrl) : isSafeSameOriginUrl(url, baseUrl);
		if (!isSafe) return [];
		return [`${url}${descriptor.length > 0 ? ` ${descriptor.join(" ")}` : ""}`];
	});

	return safeEntries.length > 0 ? safeEntries.join(", ") : null;
}

function sanitizeNode(root: Element, baseUrl: string): void {
	root
		.querySelectorAll(
			"script,style,iframe,object,embed,form,link,meta,noscript,video,audio,source,track,dialog",
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

			if (name.startsWith("on")) {
				el.removeAttribute(attr.name);
			} else if (name === "srcset") {
				const safeSrcset = sanitizeSrcset(value, baseUrl, allowExternalAsset);
				if (safeSrcset) el.setAttribute(attr.name, safeSrcset);
				else el.removeAttribute(attr.name);
			} else if (name === "href" || name === "src" || name === "poster") {
				const isSafe = allowExternalAsset
					? isSafeAssetUrl(value, baseUrl)
					: isSafeSameOriginUrl(value, baseUrl);
				if (!isSafe) el.removeAttribute(attr.name);
			} else if (name === "autofocus") {
				el.removeAttribute(attr.name);
			}
		}
	});
}
