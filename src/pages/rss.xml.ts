import { getCollection } from "astro:content";
import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { navItems, site } from "../config";

const blogNav = navItems.find((n) => n.href === "/blog");

export async function GET(context: APIContext) {
	const posts = (await getCollection("blog"))
		.filter((post) => !post.data.draft)
		.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());

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
