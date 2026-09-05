import { afterEach, describe, expect, it, vi } from "vitest";
import { cloudinarySrcSet, cloudinaryUrl } from "../image-utils";
import { loadContentPreview } from "./preview";

const ORIGIN = "https://omer.texerman.com";

/**
 * `preview.ts` memoises by href at module scope, so every test uses a unique
 * path to stay independent of the ones before it.
 */
let counter = 0;
function uniqueHref(): string {
	counter += 1;
	return `/fixture-${counter}`;
}

function respondWith(body: string): void {
	vi.stubGlobal(
		"fetch",
		vi.fn(
			async () => new Response(body, { status: 200, headers: { "Content-Type": "text/html" } }),
		),
	);
}

/** Wraps markup in the container `loadContentPreview` looks for. */
function page(inner: string): string {
	return `<html><body><main><div data-preview-content>${inner}</div></main></body></html>`;
}

async function sanitize(inner: string): Promise<string> {
	respondWith(page(inner));
	const result = await loadContentPreview(uniqueHref(), new AbortController().signal);
	if (result.kind !== "content") throw new Error(`expected content, got: ${result.message}`);
	return result.html;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("loadContentPreview", () => {
	it("refuses to fetch a cross-origin page", async () => {
		respondWith(page("<p>hi</p>"));
		const result = await loadContentPreview(
			"https://evil.example.com/x",
			new AbortController().signal,
		);
		expect(result).toEqual({ kind: "message", message: "External preview is blocked." });
		expect(fetch).not.toHaveBeenCalled();
	});

	it("throws on a non-OK response so the caller can show an error", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("nope", { status: 500 })),
		);
		await expect(loadContentPreview(uniqueHref(), new AbortController().signal)).rejects.toThrow(
			/500/,
		);
	});

	it("reports when the page has no recognisable content container", async () => {
		respondWith("<html><body><aside>nothing</aside></body></html>");
		const result = await loadContentPreview(uniqueHref(), new AbortController().signal);
		expect(result).toEqual({ kind: "message", message: "No content found." });
	});

	it("caches by href so a second open does not refetch", async () => {
		respondWith(page("<p>cached</p>"));
		const href = uniqueHref();
		await loadContentPreview(href, new AbortController().signal);
		await loadContentPreview(href, new AbortController().signal);
		expect(fetch).toHaveBeenCalledTimes(1);
	});
});

describe("sanitisation", () => {
	it("strips executable and structural elements", async () => {
		const html = await sanitize(
			'<p>keep</p><script>evil()</script><style>p{}</style><iframe src="about:blank"></iframe>' +
				'<form action="/y"></form><object></object><embed><svg></svg>',
		);
		expect(html).toContain("keep");
		for (const tag of ["script", "style", "iframe", "form", "object", "embed", "svg"]) {
			expect(html).not.toContain(`<${tag}`);
		}
	});

	it("removes inline event handlers and style attributes", async () => {
		const html = await sanitize('<p onclick="evil()" style="color:red" id="p">text</p>');
		expect(html).not.toContain("onclick");
		expect(html).not.toContain("style=");
		// Non-dangerous attributes survive.
		expect(html).toContain('id="p"');
	});

	it("rewrites same-origin links to relative hrefs", async () => {
		const html = await sanitize(`<a href="${ORIGIN}/blog?x=1#top">post</a>`);
		expect(html).toContain('href="/blog?x=1#top"');
	});

	it("drops javascript: hrefs", async () => {
		const html = await sanitize('<a href="javascript:alert(1)">x</a>');
		expect(html).not.toContain("javascript:");
		expect(html).not.toContain("href=");
	});

	it("allows external links that genuinely opt out of window.opener", async () => {
		const html = await sanitize(
			'<a href="https://github.com/OmerTexerman" target="_blank" rel="noopener noreferrer">src</a>',
		);
		expect(html).toContain('href="https://github.com/OmerTexerman"');
	});

	it("drops external hrefs on links that do not open in a new tab", async () => {
		const html = await sanitize('<a href="https://github.com/OmerTexerman">src</a>');
		expect(html).not.toContain("github.com");
	});

	it("is not fooled by a rel value that merely contains 'noopener'", async () => {
		// `rel` is a space-separated token list. A substring check would let
		// `xnoopenerx` through and hand the opened page a live window.opener.
		const html = await sanitize(
			'<a href="https://evil.example.com" target="_blank" rel="xnoopenerx">x</a>',
		);
		expect(html).not.toContain("evil.example.com");
	});

	it("keeps external image sources but strips external non-image sources", async () => {
		const html = await sanitize(
			'<img src="https://res.cloudinary.com/x/image/upload/v1/a.jpg" alt="a">',
		);
		expect(html).toContain("res.cloudinary.com");
	});

	it("filters unusable candidates out of a srcset", async () => {
		const html = await sanitize(
			'<img alt="a" src="https://res.cloudinary.com/x/image/upload/v1/a.jpg" ' +
				'srcset="https://res.cloudinary.com/x/image/upload/v1/a.jpg 320w, javascript:alert(1) 640w">',
		);
		expect(html).toContain("320w");
		expect(html).not.toContain("javascript:");
	});

	it("preserves the responsive Cloudinary candidates used by photo collection previews", async () => {
		const original =
			"https://res.cloudinary.com/dyzyx5v81/image/upload/v1774237212/IMG_0022_jteq6b.jpg";
		const srcset = cloudinarySrcSet(original, [448, 672, 896]);
		const src = cloudinaryUrl(original, 896);
		const html = await sanitize(`<img src="${src}" srcset="${srcset}" alt="Paris">`);
		const image = new DOMParser().parseFromString(html, "text/html").querySelector("img");

		expect(image?.getAttribute("src")).toBe(src);
		expect(image?.getAttribute("srcset")).toBe(srcset);
	});

	it("handles candidates without descriptors and separators without spaces", async () => {
		const html = await sanitize(
			'<img srcset="/fallback.jpg, /double.jpg 2x,/triple.jpg 3x" alt="Photo">',
		);
		const image = new DOMParser().parseFromString(html, "text/html").querySelector("img");

		expect(image?.getAttribute("srcset")).toBe(
			`${ORIGIN}/fallback.jpg, ${ORIGIN}/double.jpg 2x, ${ORIGIN}/triple.jpg 3x`,
		);
	});

	it("removes unsafe candidates without turning their comma-separated data into URLs", async () => {
		const html = await sanitize(
			'<img srcset="data:image/png;base64,AAAA 1x,javascript:alert(1) 2x,/safe.jpg 3x" alt="Photo">',
		);
		const image = new DOMParser().parseFromString(html, "text/html").querySelector("img");

		expect(image?.getAttribute("srcset")).toBe(`${ORIGIN}/safe.jpg 3x`);
	});

	it("removes autofocus so a preview cannot steal focus", async () => {
		const html = await sanitize('<input autofocus value="x">');
		expect(html).not.toContain("autofocus");
	});
});
