import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { navItems, site } from "../config";
import { getPublishedPosts } from "../utils";

const blogNav = navItems.find((n) => n.href === "/blog");

export async function GET(context: APIContext) {
	const posts = await getPublishedPosts();

	return rss({
		title: `${site.name}'s Blog`,
		description: blogNav?.description ?? site.title,
		site: context.site ?? new URL(site.url),
		items: posts.map((post) => ({
			title: post.data.title,
			pubDate: post.data.pubDate,
			description: post.data.description,
			link: `/blog/${post.id}/`,
		})),
	});
}
