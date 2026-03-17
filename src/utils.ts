import { getCollection } from "astro:content";

/** Get published blog posts, sorted newest first */
export async function getPublishedPosts() {
	return (await getCollection("blog"))
		.filter((post) => !post.data.draft)
		.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

/** Format a date for display */
export function formatDate(date: Date, style: "short" | "long" = "short"): string {
	return date.toLocaleDateString("en-US", {
		year: "numeric",
		month: style,
		day: "numeric",
	});
}
