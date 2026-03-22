import { type CollectionEntry, getCollection } from "astro:content";
import type { ShelfBook, SpotlightInfo } from "./types";

export interface WordEntry {
	id: string;
	word: string;
	partOfSpeech?: string;
	quip: string;
	date: Date;
	image?: string;
}

export interface ReadingSection {
	status: "reading" | "finished" | "want-to-read";
	title: string;
	books: CollectionEntry<"books">[];
}

const readingSectionOrder = [
	{ status: "reading", title: "Currently Reading" },
	{ status: "finished", title: "Finished" },
	{ status: "want-to-read", title: "Want to Read" },
] as const;

/** Get published blog posts, sorted newest first. */
export async function getPublishedPosts() {
	return (await getCollection("blog"))
		.filter((post) => !post.data.draft)
		.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

/** Group reading-list books into display sections. */
export async function getReadingSections(): Promise<ReadingSection[]> {
	const allBooks = await getCollection("books");

	return readingSectionOrder
		.map(({ status, title }) => ({
			status,
			title,
			books: allBooks.filter((book) => book.data.status === status),
		}))
		.filter((section) => section.books.length > 0);
}

/** Select the books shown on the homepage shelf and desk stack. */
export async function getFeaturedShelfBooks(limit = 5): Promise<ShelfBook[]> {
	const allBooks = await getCollection("books");

	return allBooks
		.filter((book) => book.data.status === "reading" || book.data.status === "finished")
		.slice(0, limit)
		.map((book) => ({
			title: book.data.title,
			spineColor: book.data.spineColor,
		}));
}

export async function getOrderedProjects() {
	return (await getCollection("projects")).sort((a, b) => a.data.order - b.data.order);
}

export interface PhotoCollection {
	id: string;
	title: string;
	location?: string;
	date?: string;
	description?: string;
	cover: string;
	post?: string;
	photos: { src: string; alt: string; caption?: string }[];
}

export async function getPhotoCollections(): Promise<PhotoCollection[]> {
	const entries = await getCollection("photos");
	return entries.map((entry) => ({
		id: entry.id,
		...entry.data,
	}));
}

/** Get the current spotlight (employee of the week). */
export async function getSpotlight(): Promise<SpotlightInfo | null> {
	const entries = await getCollection("spotlight");
	if (entries.length === 0) return null;
	return entries[0].data;
}

export interface SetupCategory {
	name: string;
	items: { name: string; detail?: string }[];
}

/** Get the current setup/tools configuration. */
export async function getSetup(): Promise<SetupCategory[]> {
	const entries = await getCollection("setup");
	if (entries.length === 0) return [];
	return entries[0].data.categories;
}

/** Get all words sorted by date, newest first. Excludes future-dated entries.
 *
 * Dates are compared at UTC midnight to stay symmetric with how word dates are
 * stored (noon UTC). Comparing raw timestamps would exclude today's word when
 * the build server's clock is before noon UTC.
 */
export async function getAllWords(): Promise<WordEntry[]> {
	const todayMidnightUTC = new Date();
	todayMidnightUTC.setUTCHours(0, 0, 0, 0);
	const entries = await getCollection("words");
	return entries
		.map((entry) => ({
			id: entry.id,
			...entry.data,
		}))
		.filter((w) => {
			const wordDateMidnight = new Date(w.date);
			wordDateMidnight.setUTCHours(0, 0, 0, 0);
			return wordDateMidnight.valueOf() <= todayMidnightUTC.valueOf();
		})
		.sort((a, b) => b.date.valueOf() - a.date.valueOf());
}
