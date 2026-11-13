import { describe, expect, it } from "vitest";
import { parseRecommendation, REC_LIMITS, recommendationIssue } from "./recs";

describe("parseRecommendation", () => {
	it("needs only a title", () => {
		expect(parseRecommendation({ title: "  The Peregrine " })).toEqual({
			ok: true,
			rec: { kind: "other", title: "The Peregrine" },
		});
	});

	it("rejects a missing or blank title", () => {
		expect(parseRecommendation({ author: "Someone" }).ok).toBe(false);
		expect(parseRecommendation({ title: "   " }).ok).toBe(false);
		expect(parseRecommendation(null).ok).toBe(false);
	});

	it("keeps optional fields, dropping empty ones and non-strings", () => {
		const result = parseRecommendation({
			title: "T",
			author: "A",
			name: "",
			genre: 4,
			note: " hi ",
		});
		expect(result).toEqual({
			ok: true,
			rec: { kind: "other", title: "T", author: "A", note: "hi" },
		});
	});

	it("strips control characters and collapses whitespace", () => {
		const result = parseRecommendation({ title: "a\u0000b\t  c\nd", note: "one\n\n\n\ntwo" });
		expect(result).toEqual({
			ok: true,
			rec: { kind: "other", title: "ab c d", note: "one\n\ntwo" },
		});
	});

	it("rejects fields over their limit", () => {
		expect(parseRecommendation({ title: "x".repeat(REC_LIMITS.title + 1) }).ok).toBe(false);
		expect(parseRecommendation({ title: "T", note: "x".repeat(REC_LIMITS.note + 1) }).ok).toBe(
			false,
		);
	});
});

describe("kinds and links", () => {
	it("keeps a known kind and falls back to other", () => {
		expect(parseRecommendation({ title: "T", kind: "video" })).toMatchObject({
			rec: { kind: "video" },
		});
		expect(parseRecommendation({ title: "T", kind: "__proto__" })).toMatchObject({
			rec: { kind: "other" },
		});
	});

	it("takes http(s) links only", () => {
		expect(parseRecommendation({ title: "T", link: "https://youtu.be/x" })).toMatchObject({
			rec: { link: "https://youtu.be/x" },
		});
		expect(parseRecommendation({ title: "T", link: "javascript:alert(1)" }).ok).toBe(false);
		expect(parseRecommendation({ title: "T", link: "not a url" }).ok).toBe(false);
	});
});

describe("recommendationIssue", () => {
	it("keeps visitor text inside the JSON block, with backticks escaped", () => {
		const { title, body } = recommendationIssue({
			kind: "book",
			title: "T",
			note: "```\n@omer hi",
		});
		expect(title).toBe("[book] T");
		const block = body.slice(body.indexOf("```json") + 7, body.lastIndexOf("```"));
		expect(block).not.toContain("`");
		expect(JSON.parse(block)).toEqual({ kind: "book", title: "T", note: "```\n@omer hi" });
		// Nothing typed by the visitor appears outside the block.
		expect(body.slice(0, body.indexOf("```json"))).not.toContain("@omer");
	});

	it("titles the issue with the author when given", () => {
		expect(recommendationIssue({ kind: "movie", title: "T", author: "A" }).title).toBe(
			"[movie] T by A",
		);
	});
});
