/** Narrow an unknown value to a plain object. */
export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
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
