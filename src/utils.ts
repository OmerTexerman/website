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
