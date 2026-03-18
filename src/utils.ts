/** Format a date for display */
export function formatDate(date: Date, style: "short" | "long" = "short"): string {
	return date.toLocaleDateString("en-US", {
		year: "numeric",
		month: style,
		day: "numeric",
	});
}
