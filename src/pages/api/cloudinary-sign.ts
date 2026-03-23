export const prerender = false;

import type { APIRoute } from "astro";

/**
 * Generates a Cloudinary signed-upload signature.
 *
 * The browser sends the upload params (folder, timestamp, etc.) and this
 * endpoint returns a signature computed with the API secret — which never
 * leaves the server.
 *
 * Required env vars (set in Vercel → Settings → Environment Variables):
 *   CLOUDINARY_API_KEY
 *   CLOUDINARY_API_SECRET
 *   CLOUDINARY_CLOUD_NAME
 */

function envOrBail(name: string): string {
	const value = import.meta.env[name] || process.env[name];
	if (!value) throw new Error(`Missing env var: ${name}`);
	return value;
}

/** Sanitise a folder path: only allow alphanumeric, hyphens, underscores, and slashes. */
function sanitizeFolder(raw: string): string {
	return raw
		.split("/")
		.map((seg) =>
			seg
				.toLowerCase()
				.replace(/[^a-z0-9_-]/g, "-")
				.replace(/-{2,}/g, "-")
				.replace(/^-|-$/g, ""),
		)
		.filter(Boolean)
		.join("/");
}

/** Cloudinary requires params sorted alphabetically, joined with &, then
 *  appended with the API secret — and the whole thing SHA-1 hashed. */
async function sign(params: Record<string, string>, apiSecret: string): Promise<string> {
	const sorted = Object.keys(params)
		.sort()
		.map((k) => `${k}=${params[k]}`)
		.join("&");

	const data = new TextEncoder().encode(sorted + apiSecret);
	const hashBuffer = await crypto.subtle.digest("SHA-1", data);
	return Array.from(new Uint8Array(hashBuffer))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Two modes:
 *
 * 1. **Preflight** (body has `folder` only) — returns cloudName, apiKey and
 *    folder so the widget can be configured.
 *
 * 2. **Per-upload signing** (body has `params_to_sign`) — the Upload Widget
 *    calls this for every file.  We sign exactly the params the widget sends
 *    so the signature always matches.
 */
export const POST: APIRoute = async ({ request }) => {
	try {
		const apiKey = envOrBail("CLOUDINARY_API_KEY");
		const apiSecret = envOrBail("CLOUDINARY_API_SECRET");
		const cloudName = envOrBail("CLOUDINARY_CLOUD_NAME");

		const body = await request.json();

		// ── Per-upload signing (called by the widget for each file) ──
		if (body.params_to_sign) {
			const params: Record<string, string> = { ...body.params_to_sign };
			// Sanitise folder if the widget included it in the signing params
			if (params.folder) params.folder = sanitizeFolder(params.folder);
			const signature = await sign(params, apiSecret);
			return new Response(JSON.stringify({ signature }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}

		// ── Preflight — return config so the widget can open ──
		const folder = sanitizeFolder(body.folder || "website");

		return new Response(
			JSON.stringify({
				cloudName,
				apiKey,
				folder,
			}),
			{
				status: 200,
				headers: { "Content-Type": "application/json" },
			},
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : "Internal error";
		return new Response(JSON.stringify({ error: message }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
};
