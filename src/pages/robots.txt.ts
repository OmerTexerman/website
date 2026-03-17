import type { APIContext } from "astro";
import { site } from "../config";

export function GET(context: APIContext) {
	const siteUrl = context.site ?? new URL(site.url);
	return new Response(
		`User-agent: *
Allow: /

Sitemap: ${siteUrl}sitemap-index.xml
`,
		{ headers: { "Content-Type": "text/plain" } },
	);
}
