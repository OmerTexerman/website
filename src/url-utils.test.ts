import { describe, expect, it } from "vitest";
import { getSameOriginHref, getSameOriginUrl, isSafeHttpUrl, toRelativeHref } from "./url-utils";

describe("getSameOriginUrl", () => {
	it("accepts same-origin relative URLs", () => {
		expect(getSameOriginUrl("/blog/post", "https://omer.texerman.com")?.href).toBe(
			"https://omer.texerman.com/blog/post",
		);
	});

	it("rejects cross-origin URLs", () => {
		expect(getSameOriginUrl("https://example.com/post", "https://omer.texerman.com")).toBeNull();
	});
});

describe("getSameOriginHref", () => {
	it("normalizes same-origin URLs to relative hrefs", () => {
		expect(
			getSameOriginHref(
				"https://omer.texerman.com/blog/post?view=full#notes",
				"https://omer.texerman.com",
			),
		).toBe("/blog/post?view=full#notes");
	});

	it("rebases fragment-only URLs against the provided page", () => {
		expect(getSameOriginHref("#section-2", "https://omer.texerman.com/blog/post")).toBe(
			"/blog/post#section-2",
		);
	});
});

describe("isSafeHttpUrl", () => {
	it("rejects javascript URLs", () => {
		expect(isSafeHttpUrl("javascript:alert(1)", "https://omer.texerman.com")).toBe(false);
	});

	it("accepts https URLs", () => {
		expect(isSafeHttpUrl("https://example.com/demo", "https://omer.texerman.com")).toBe(true);
	});
});

describe("toRelativeHref", () => {
	it("preserves pathname, query, and hash", () => {
		expect(
			toRelativeHref(new URL("https://omer.texerman.com/projects/demo?tab=details#media")),
		).toBe("/projects/demo?tab=details#media");
	});
});
