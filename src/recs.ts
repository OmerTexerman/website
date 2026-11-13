/**
 * Recommendations ("slop"): books, films, shows, videos, anything, sent from
 * the /slop page.
 *
 * The server route (pages/api/recommend.ts) validates a submission with
 * `parseRecommendation`, then files it as an issue in a private inbox repo
 * with `recommendationIssue`. Labelling that issue `accepted` runs the inbox
 * repo's workflow (ops/recs-inbox): a book is committed into
 * src/content/books, anything else is just closed.
 */

/** What kind of thing it is, and what to call its maker on the form. */
export const REC_KINDS = {
	book: { label: "book", by: "author" },
	movie: { label: "movie", by: "director" },
	show: { label: "show", by: "creator" },
	video: { label: "video", by: "channel" },
	music: { label: "music", by: "artist" },
	game: { label: "game", by: "studio" },
	podcast: { label: "podcast", by: "host" },
	other: { label: "something else", by: "by" },
} as const;

export type RecKind = keyof typeof REC_KINDS;

export function isRecKind(value: unknown): value is RecKind {
	return typeof value === "string" && Object.hasOwn(REC_KINDS, value);
}

export interface Recommendation {
	kind: RecKind;
	title: string;
	author?: string;
	/** What the recommender wants to be called. */
	name?: string;
	genre?: string;
	note?: string;
	/** Where to find it (http or https only). */
	link?: string;
}

/** Longest each field may be, in characters. */
export const REC_LIMITS = {
	title: 200,
	author: 120,
	name: 60,
	genre: 60,
	note: 600,
	link: 300,
} as const satisfies Record<Exclude<keyof Recommendation, "kind">, number>;

type ParseResult = { ok: true; rec: Recommendation } | { ok: false; error: string };

/** Trim, drop control characters and collapse runs of spaces (newlines are
 *  kept for the note only). */
function clean(value: unknown, multiline = false): string {
	if (typeof value !== "string") return "";
	// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point
	const noControl = value.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "");
	const text = multiline
		? noControl.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n")
		: noControl.replace(/\s+/g, " ");
	return text.trim();
}

export function parseRecommendation(input: unknown): ParseResult {
	if (typeof input !== "object" || input === null) return { ok: false, error: "Invalid request." };
	const raw = input as Record<string, unknown>;
	const kind = isRecKind(raw.kind) ? raw.kind : "other";
	const rec: Recommendation = { kind, title: clean(raw.title) };
	if (!rec.title) return { ok: false, error: "It needs a title." };

	for (const key of ["author", "name", "genre"] as const) {
		const value = clean(raw[key]);
		if (value) rec[key] = value;
	}
	const note = clean(raw.note, true);
	if (note) rec.note = note;
	const link = clean(raw.link);
	if (link) {
		let url: URL | null = null;
		try {
			url = new URL(link);
		} catch {}
		if (!url || (url.protocol !== "https:" && url.protocol !== "http:")) {
			return { ok: false, error: "The link should start with https://" };
		}
		rec.link = link;
	}

	for (const [key, limit] of Object.entries(REC_LIMITS) as [keyof typeof REC_LIMITS, number][]) {
		if ((rec[key]?.length ?? 0) > limit) {
			return { ok: false, error: `${key} is too long (${limit} characters max).` };
		}
	}
	return { ok: true, rec };
}

export const REC_JSON_START = "<!-- rec -->";

/** The inbox issue: a readable title, and the submission as a JSON block the
 *  accept workflow parses. Everything the visitor typed stays inside the code
 *  block, so it can't @-mention anyone or inject markdown. */
export function recommendationIssue(rec: Recommendation): { title: string; body: string } {
	const byline = rec.author ? ` by ${rec.author}` : "";
	const title = `[${rec.kind}] ${rec.title}${byline}`.slice(0, 240);
	// A backtick can't close the fence once it is a JSON escape.
	const json = JSON.stringify(rec, null, 2).replace(/`/g, "\\u0060");
	const body = [
		`Someone fed you some slop (a ${REC_KINDS[rec.kind].label}) on the website.`,
		"",
		rec.kind === "book"
			? "Add the `accepted` label to put it on the Want to Read shelf (edit the JSON first to fix anything). Close it to pass."
			: "Close it once you've had a look.",
		"",
		REC_JSON_START,
		"```json",
		json,
		"```",
	].join("\n");
	return { title, body };
}
