import type { APIContext } from "astro";
import { getSiteUrl } from "../config";

export function GET(context: APIContext) {
	const siteUrl = getSiteUrl(context.site);
	return new Response(
		`User-agent: *
Allow: /

Sitemap: ${siteUrl}sitemap-index.xml
`,
		{ headers: { "Content-Type": "text/plain" } },
	);
}
