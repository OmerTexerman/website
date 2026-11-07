#!/usr/bin/env node
/**
 * One-off: copy book covers that are hotlinked from other sites (Open Library,
 * Goodreads, publishers…) into Cloudinary, and point each book at the copy.
 *
 * Hotlinked covers load slowly (Open Library redirects through archive.org)
 * and break whenever the other site does. Cloudinary copies are cached on its
 * CDN and resized per screen by src/image-utils.ts, like the photos.
 *
 * Usage (needs the same env vars as /api/cloudinary-sign):
 *   vercel env pull .env.local
 *   node --env-file=.env.local scripts/migrate-covers.mjs            # dry run
 *   node --env-file=.env.local scripts/migrate-covers.mjs --write    # do it
 *
 * Safe to re-run: covers already on Cloudinary are skipped, and each book
 * uploads to a stable public id (website/books/<file-name>).
 */
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BOOKS_DIR = "src/content/books";
const FOLDER = "website/books";
const write = process.argv.includes("--write");

const { CLOUDINARY_CLOUD_NAME: cloud, CLOUDINARY_API_KEY: key, CLOUDINARY_API_SECRET: secret } =
	process.env;
if (!cloud || !key || !secret) {
	console.error("Missing CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET.");
	process.exit(1);
}

/** Cloudinary signature: sorted params joined with &, secret appended, SHA-1. */
function sign(params) {
	const payload = Object.keys(params)
		.sort()
		.map((k) => `${k}=${params[k]}`)
		.join("&");
	return createHash("sha1").update(payload + secret).digest("hex");
}

async function upload(remoteUrl, publicId) {
	const params = {
		folder: FOLDER,
		overwrite: "true",
		public_id: publicId,
		timestamp: String(Math.floor(Date.now() / 1000)),
	};
	const form = new FormData();
	form.append("file", remoteUrl);
	form.append("api_key", key);
	for (const [k, v] of Object.entries(params)) form.append(k, v);
	form.append("signature", sign(params));
	const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, {
		method: "POST",
		body: form,
	});
	const data = await res.json();
	if (!res.ok || !data.secure_url) throw new Error(data.error?.message ?? `HTTP ${res.status}`);
	return data.secure_url;
}

const COVER_LINE = /^cover:\s*(['"]?)(https?:\/\/[^'"\n]+)\1\s*$/m;
let moved = 0;
let failed = 0;

for (const file of (await readdir(BOOKS_DIR)).filter((f) => f.endsWith(".yaml")).sort()) {
	const path = join(BOOKS_DIR, file);
	const text = await readFile(path, "utf8");
	const match = COVER_LINE.exec(text);
	if (!match) continue;
	const url = match[2];
	if (url.startsWith("https://res.cloudinary.com/")) continue;

	const slug = file.replace(/\.yaml$/, "");
	if (!write) {
		console.log(`would move  ${slug}  ${url}`);
		continue;
	}
	try {
		const cloudUrl = await upload(url, slug);
		await writeFile(path, text.replace(COVER_LINE, `cover: ${cloudUrl}`));
		console.log(`moved       ${slug}  ->  ${cloudUrl}`);
		moved++;
	} catch (err) {
		console.error(`FAILED      ${slug}  ${url}  (${err.message})`);
		failed++;
	}
}

if (!write) console.log("\nDry run. Re-run with --write to upload and update the files.");
else console.log(`\n${moved} moved, ${failed} failed.`);
if (failed) process.exitCode = 1;
