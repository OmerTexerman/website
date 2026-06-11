export const prerender = false;

import type { APIRoute } from "astro";

/**
 * Generates a Cloudinary signed-upload signature.
 *
 * The browser sends the upload params (folder, timestamp, etc.) and this
 * endpoint returns a signature computed with the API secret — which never
 * leaves the server.
 *
 * Auth: callers must present the GitHub token that Sveltia CMS obtained at
 * sign-in (Authorization: Bearer <token>). The token is verified against
 * GitHub — only users with push access to the site repo may request
 * signatures, so the endpoint can't be used by strangers to upload into the
 * Cloudinary account.
 *
 * Required env vars (set in Vercel → Settings → Environment Variables):
 *   CLOUDINARY_API_KEY
 *   CLOUDINARY_API_SECRET
 *   CLOUDINARY_CLOUD_NAME
 * Optional:
 *   ADMIN_GITHUB_REPO  (defaults to the repo Sveltia is configured against)
 */

/** Must match the backend repo in public/admin/config.yml. */
const DEFAULT_ADMIN_REPO = "OmerTexerman/website";

/** Uploads may only target the site's root folder or one flat level below it. */
const ALLOWED_FOLDER = /^website(\/[a-z0-9_-]+)?$/;

function envOrBail(name: string): string {
	const value = import.meta.env[name] || process.env[name];
	if (!value) throw new Error(`Missing env var: ${name}`);
	return value;
}

function json(status: number, body: Record<string, unknown>): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

/** Verifies the GitHub token belongs to a user with push access to the repo. */
async function hasRepoPushAccess(token: string, repo: string): Promise<boolean> {
	const res = await fetch(`https://api.github.com/repos/${repo}`, {
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: "application/vnd.github+json",
			"User-Agent": "website-cloudinary-sign",
		},
	});
	if (!res.ok) return false;
	const data: unknown = await res.json();
	return (
		typeof data === "object" &&
		data !== null &&
		"permissions" in data &&
		typeof data.permissions === "object" &&
		data.permissions !== null &&
		"push" in data.permissions &&
		data.permissions.push === true
	);
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
		const adminRepo =
			import.meta.env.ADMIN_GITHUB_REPO || process.env.ADMIN_GITHUB_REPO || DEFAULT_ADMIN_REPO;

		const authHeader = request.headers.get("authorization") || "";
		const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
		if (!token) {
			return json(401, { error: "Sign in to the CMS first (missing GitHub token)" });
		}
		if (!(await hasRepoPushAccess(token, adminRepo))) {
			return json(403, { error: "GitHub token is not authorized for this site" });
		}

		const body = await request.json();
		const folder: string = body.folder || "website";
		if (!ALLOWED_FOLDER.test(folder)) {
			return json(400, { error: `Invalid upload folder: ${folder}` });
		}

		const timestamp = Math.floor(Date.now() / 1000).toString();

		const paramsToSign: Record<string, string> = {
			folder,
			timestamp,
		};

		const signature = await sign(paramsToSign, apiSecret);

		return json(200, {
			signature,
			timestamp,
			cloudName,
			apiKey,
			folder,
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : "Internal error";
		return json(500, { error: message });
	}
};
