import { describe, expect, it } from "vitest";
import { formatDate, isRecord, safeJson } from "./utils";

describe("isRecord", () => {
	it("accepts plain objects", () => {
		expect(isRecord({ a: 1 })).toBe(true);
	});

	it("rejects arrays and null", () => {
		expect(isRecord([])).toBe(false);
		expect(isRecord(null)).toBe(false);
	});
});

describe("safeJson", () => {
	it("escapes angle brackets in serialized output", () => {
		expect(safeJson({ html: "</script><div>" })).toBe(
			'{"html":"\\u003c/script\\u003e\\u003cdiv\\u003e"}',
		);
	});
});

describe("formatDate", () => {
	it("supports UTC formatting for date-only content", () => {
		const date = new Date("2026-03-21T12:00:00.000Z");
		expect(formatDate(date, "long", { utc: true })).toBe("March 21, 2026");
	});
});
