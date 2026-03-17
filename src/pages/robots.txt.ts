import type { APIContext } from "astro";

export function GET(context: APIContext) {
	const siteUrl = context.site ?? new URL("https://omer.texerman.com");
	return new Response(
		`User-agent: *
Allow: /

Sitemap: ${siteUrl}sitemap-index.xml
`,
		{ headers: { "Content-Type": "text/plain" } },
	);
}
