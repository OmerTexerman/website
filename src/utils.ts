/** Narrow an unknown value to a plain object (excludes arrays). */
export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Escape &lt;/script&gt; sequences so embedded JSON cannot break a script block. */
export function safeJson(v: unknown): string {
	return JSON.stringify(v).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
}

/** Format a date for display. Pass `utc: true` for content with
 *  noon-UTC date transforms to prevent timezone day shifts. */
export function formatDate(
	date: Date,
	style: "short" | "long" = "short",
	options?: { utc?: boolean },
): string {
	return date.toLocaleDateString("en-US", {
		year: "numeric",
		month: style,
		day: "numeric",
		...(options?.utc ? { timeZone: "UTC" } : {}),
	});
}
