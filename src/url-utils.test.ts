import { describe, expect, it } from "vitest";
import {
	getSameOriginHref,
	getSameOriginReferrer,
	getSameOriginUrl,
	isSafeHttpUrl,
	toRelativeHref,
} from "./url-utils";

// vitest.config.ts pins the happy-dom origin to https://omer.texerman.com.
const ORIGIN = "https://omer.texerman.com";

describe("getSameOriginUrl", () => {
	it("accepts absolute same-origin URLs", () => {
		expect(getSameOriginUrl(`${ORIGIN}/blog`)?.pathname).toBe("/blog");
	});

	it("resolves relative paths against the current origin", () => {
		expect(getSameOriginUrl("/reading")?.href).toBe(`${ORIGIN}/reading`);
	});

	it("rejects other origins", () => {
		expect(getSameOriginUrl("https://evil.example.com/blog")).toBeNull();
	});

	it.each([
		"javascript:alert(1)",
		"data:text/html,<script>",
		"file:///etc/passwd",
	])("rejects the non-http scheme %s", (value) => {
		expect(getSameOriginUrl(value)).toBeNull();
	});

	it("rejects unparseable input", () => {
		expect(getSameOriginUrl("http://")).toBeNull();
	});

	it("compares against an explicit base rather than the page origin", () => {
		const base = "https://cdn.example.com/a/b";
		expect(getSameOriginUrl("/c", base)?.href).toBe("https://cdn.example.com/c");
		expect(getSameOriginUrl(`${ORIGIN}/c`, base)).toBeNull();
	});
});

describe("toRelativeHref", () => {
	it("keeps the query string and hash", () => {
		const url = new URL(`${ORIGIN}/blog?page=2#top`);
		expect(toRelativeHref(url)).toBe("/blog?page=2#top");
	});

	it("drops the origin", () => {
		expect(toRelativeHref(new URL(`${ORIGIN}/photos`))).toBe("/photos");
	});
});

describe("getSameOriginHref", () => {
	it("returns a relative href for same-origin input", () => {
		expect(getSameOriginHref(`${ORIGIN}/projects?x=1`)).toBe("/projects?x=1");
	});

	it("returns null for cross-origin input", () => {
		expect(getSameOriginHref("https://github.com/OmerTexerman")).toBeNull();
	});
});

describe("isSafeHttpUrl", () => {
	it("accepts http and https", () => {
		expect(isSafeHttpUrl("https://example.com")).toBe(true);
		expect(isSafeHttpUrl("http://example.com")).toBe(true);
	});

	it("accepts cross-origin URLs — it only guards the scheme", () => {
		expect(isSafeHttpUrl("https://evil.example.com")).toBe(true);
	});

	it("rejects script-bearing schemes", () => {
		expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
		expect(isSafeHttpUrl("data:text/html,x")).toBe(false);
	});
});

describe("getSameOriginReferrer", () => {
	function setReferrer(value: string): void {
		Object.defineProperty(document, "referrer", { value, configurable: true });
	}

	it("returns null when there is no referrer", () => {
		setReferrer("");
		expect(getSameOriginReferrer()).toBeNull();
	});

	it("returns null for a cross-origin referrer", () => {
		setReferrer("https://news.ycombinator.com/");
		expect(getSameOriginReferrer()).toBeNull();
	});

	it("returns the URL for a same-origin referrer", () => {
		setReferrer(`${ORIGIN}/blog`);
		expect(getSameOriginReferrer()?.pathname).toBe("/blog");
	});
});
