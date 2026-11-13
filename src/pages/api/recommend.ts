export const prerender = false;

import type { APIRoute } from "astro";
import { siteOrigin } from "../../config";
import { parseRecommendation, recommendationIssue } from "../../recs";

/**
 * Takes a recommendation from the /slop form and files it as an issue in a
 * private inbox repo, where it waits to be accepted (see
 * ops/recs-inbox/README.md). Nothing a visitor sends reaches the site
 * until then.
 *
 * Bots are kept out by Cloudflare Turnstile (verified here), a hidden field
 * people never fill in, and an Origin check.
 *
 * Env vars (Vercel → Settings → Environment Variables):
 *   TURNSTILE_SECRET_KEY        Turnstile widget's secret key
 *   PUBLIC_TURNSTILE_SITE_KEY   its site key (read by the form at build time)
 *   RECS_GITHUB_TOKEN           fine-grained token: Issues read/write on the inbox repo only
 *   RECS_REPO                   optional, defaults to OmerTexerman/recs-inbox
 */

const DEFAULT_REPO = "OmerTexerman/recs-inbox";
/** Cloudflare's always-pass test secret, used only by `astro dev`. */
const DEV_TURNSTILE_SECRET = "1x0000000000000000000000000000000AA";
const MAX_BODY_BYTES = 8 * 1024;

function env(name: string): string | undefined {
	return import.meta.env[name] || process.env[name] || undefined;
}

function json(status: number, body: Record<string, unknown>): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
	});
}

function allowedOrigin(origin: string | null): boolean {
	if (!origin) return false;
	if (origin === siteOrigin) return true;
	// Local dev only.
	return import.meta.env.DEV && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

async function verifyTurnstile(token: string, ip: string | null): Promise<boolean> {
	const secret =
		env("TURNSTILE_SECRET_KEY") ?? (import.meta.env.DEV ? DEV_TURNSTILE_SECRET : undefined);
	if (!secret) return false;
	const form = new URLSearchParams({ secret, response: token });
	if (ip) form.set("remoteip", ip);
	try {
		const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
			method: "POST",
			body: form,
		});
		const data = (await res.json()) as { success?: boolean };
		return data.success === true;
	} catch {
		return false;
	}
}

export const POST: APIRoute = async ({ request }) => {
	if (!allowedOrigin(request.headers.get("origin"))) return json(403, { error: "Not allowed." });
	if (!request.headers.get("content-type")?.includes("application/json")) {
		return json(415, { error: "Send JSON." });
	}

	const text = await request.text();
	if (text.length > MAX_BODY_BYTES) return json(413, { error: "That's a lot of text." });
	let input: Record<string, unknown>;
	try {
		input = JSON.parse(text);
	} catch {
		return json(400, { error: "Invalid request." });
	}

	// The hidden "website" field: people never see it, form-filling bots do.
	// Pretend it worked so they don't learn anything.
	if (typeof input.website === "string" && input.website !== "") return json(200, { ok: true });

	const parsed = parseRecommendation(input);
	if (!parsed.ok) return json(400, { error: parsed.error });

	const token = typeof input.turnstileToken === "string" ? input.turnstileToken : "";
	const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
	if (!token || !(await verifyTurnstile(token, ip))) {
		return json(403, { error: "Couldn't confirm you're not a bot. Try again?" });
	}

	const githubToken = env("RECS_GITHUB_TOKEN");
	if (!githubToken) return json(503, { error: "Recommendations aren't set up yet." });
	const repo = env("RECS_REPO") ?? DEFAULT_REPO;

	const issue = recommendationIssue(parsed.rec);
	const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${githubToken}`,
			Accept: "application/vnd.github+json",
			"Content-Type": "application/json",
			"User-Agent": "website-recs",
		},
		body: JSON.stringify({ ...issue, labels: ["rec"] }),
	});
	if (!res.ok) {
		console.error("rec: GitHub issue failed", res.status, await res.text().catch(() => ""));
		return json(502, { error: "Something went wrong on my end. Try again later?" });
	}
	return json(200, { ok: true });
};
