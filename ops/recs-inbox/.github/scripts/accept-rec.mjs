// Runs in the private recs inbox repo when an issue gets the `accepted` label.
// Reads the recommendation's JSON block back out of the issue. A book is
// committed into the website repo as Want to Read; anything else has no place
// on the site yet, so it's just noted. Then it comments and closes.
//
// Source of truth: ops/recs-inbox in the website repo.
//
// Env: GITHUB_EVENT_PATH, GITHUB_REPOSITORY (set by Actions), GITHUB_TOKEN
// (this repo's issues), WEBSITE_TOKEN (contents write on the website repo),
// WEBSITE_REPO (e.g. OmerTexerman/website).

import { readFileSync } from "node:fs";

const LIMITS = { title: 200, author: 120, name: 60, genre: 60, note: 600, link: 300 };
// Muted spine colours, in the range the existing books use.
const SPINES = ["#5a4a3a", "#2a4a6a", "#6a2a2a", "#3a5a3a", "#4a3a5a", "#6a5a2a", "#2a5a5a", "#5a2a4a"];

const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
const issue = event.issue;
const inboxRepo = process.env.GITHUB_REPOSITORY;
const websiteRepo = process.env.WEBSITE_REPO;

async function github(token, method, path, body) {
	const res = await fetch(`https://api.github.com${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: "application/vnd.github+json",
			"User-Agent": "recs-inbox",
			...(body ? { "Content-Type": "application/json" } : {}),
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	if (res.status === 404 && method === "GET") return null;
	if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
	return res.json();
}

const comment = (text) =>
	github(process.env.GITHUB_TOKEN, "POST", `/repos/${inboxRepo}/issues/${issue.number}/comments`, {
		body: text,
	});

/** The recommendation, as the site's API wrote it (possibly edited since). */
function readRecommendation(body) {
	const match = /```json\s*\n([\s\S]*?)\n```/.exec(body ?? "");
	if (!match) throw new Error("No ```json block in the issue.");
	const raw = JSON.parse(match[1]);
	const rec = {};
	for (const [key, limit] of Object.entries(LIMITS)) {
		const value = typeof raw[key] === "string" ? raw[key].trim() : "";
		if (value) rec[key] = value.slice(0, limit);
	}
	if (!rec.title) throw new Error("The JSON block has no title.");
	rec.kind = typeof raw.kind === "string" ? raw.kind : "other";
	return rec;
}

function slugify(text) {
	return (
		text
			.normalize("NFKD")
			.replace(/[̀-ͯ]/g, "")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 60)
			.replace(/-+$/, "") || "book"
	);
}

function spineFor(title) {
	let hash = 0;
	for (const char of title) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
	return SPINES[hash % SPINES.length];
}

/** Best effort: a cover from Open Library, like the other books use. */
async function findCover(rec) {
	try {
		const params = new URLSearchParams({ title: rec.title, limit: "1", fields: "cover_i" });
		if (rec.author) params.set("author", rec.author);
		const res = await fetch(`https://openlibrary.org/search.json?${params}`, {
			signal: AbortSignal.timeout(8000),
		});
		const id = (await res.json()).docs?.[0]?.cover_i;
		return id ? `https://covers.openlibrary.org/b/id/${id}-M.jpg` : undefined;
	} catch {
		return undefined;
	}
}

function toYaml(rec, cover) {
	const fields = {
		title: rec.title,
		author: rec.author ?? "Unknown",
		spineColor: spineFor(rec.title),
		cover,
		status: "want-to-read",
		recommendedBy: rec.name ?? "a friend",
		recommendationNote: rec.note,
		genre: rec.genre,
	};
	// JSON strings are valid YAML scalars, so visitor text can't break out.
	return `${Object.entries(fields)
		.filter(([, value]) => value !== undefined)
		.map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
		.join("\n")}\n`;
}

try {
	const rec = readRecommendation(issue.body);
	// Only books have a place on the site so far; the rest is just for me.
	if (rec.kind !== "book") {
		await comment(`Noted. Only books go on the site, so this ${rec.kind} stays here.`);
		await github(process.env.GITHUB_TOKEN, "PATCH", `/repos/${inboxRepo}/issues/${issue.number}`, {
			state: "closed",
			state_reason: "completed",
		});
		process.exit(0);
	}
	const cover = await findCover(rec);
	const base = slugify(rec.title);
	let path = "";
	for (let n = 1; n < 20; n++) {
		const candidate = `src/content/books/${n === 1 ? base : `${base}-${n}`}.yaml`;
		const existing = await github(
			process.env.WEBSITE_TOKEN,
			"GET",
			`/repos/${websiteRepo}/contents/${candidate}`,
		);
		if (!existing) {
			path = candidate;
			break;
		}
	}
	if (!path) throw new Error("Couldn't find a free file name.");

	await github(process.env.WEBSITE_TOKEN, "PUT", `/repos/${websiteRepo}/contents/${path}`, {
		message: `Add "${rec.title}" to Want to Read, recommended by ${rec.name ?? "a friend"}`,
		content: Buffer.from(toYaml(rec, cover)).toString("base64"),
	});
	await comment(`Added to the Want to Read shelf as \`${path}\`. The site redeploys in a minute or two.`);
	await github(process.env.GITHUB_TOKEN, "PATCH", `/repos/${inboxRepo}/issues/${issue.number}`, {
		state: "closed",
		state_reason: "completed",
	});
} catch (error) {
	console.error(error);
	await comment(
		`Couldn't add this one: ${error instanceof Error ? error.message : error}\n\nFix the JSON block, then remove and re-add the \`accepted\` label.`,
	).catch(() => {});
	process.exit(1);
}
