/** Format a date for display */
export function formatDate(date: Date, style: "short" | "long" = "short"): string {
	return date.toLocaleDateString("en-US", {
		year: "numeric",
		month: style,
		day: "numeric",
	});
}

/** Format a date in UTC — used for content with noon-UTC date transforms
 *  to prevent timezone-dependent day shifts. */
export function formatDateUTC(date: Date, style: "short" | "long" = "short"): string {
	return date.toLocaleDateString("en-US", {
		year: "numeric",
		month: style,
		day: "numeric",
		timeZone: "UTC",
	});
}
