import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { blogFeed, getSiteUrl } from "../config";
import { getPublishedPosts } from "../content/selectors";

export async function GET(context: APIContext) {
	const posts = await getPublishedPosts();

	return rss({
		title: blogFeed.title,
		description: blogFeed.description,
		site: getSiteUrl(context.site),
		items: posts.map((post) => ({
			title: post.data.title,
			pubDate: post.data.pubDate,
			description: post.data.description,
			link: `/blog/${post.id}`,
		})),
	});
}
