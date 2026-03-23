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

export const POST: APIRoute = async ({ request }) => {
	try {
		const apiKey = envOrBail("CLOUDINARY_API_KEY");
		const apiSecret = envOrBail("CLOUDINARY_API_SECRET");
		const cloudName = envOrBail("CLOUDINARY_CLOUD_NAME");

		const body = await request.json();
		const folder: string = body.folder || "website";
		const timestamp = body.timestamp || Math.floor(Date.now() / 1000).toString();

		// The widget may send additional params (e.g. source=uw) that must
		// all be included in the signature.  Accept an explicit params_to_sign
		// string from the client when provided, otherwise fall back to the
		// folder+timestamp pair.
		const paramsToSign: Record<string, string> = body.params_to_sign
			? Object.fromEntries(new URLSearchParams(body.params_to_sign))
			: { folder, timestamp };

		const signature = await sign(paramsToSign, apiSecret);

		return new Response(
			JSON.stringify({
				signature,
				timestamp,
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
