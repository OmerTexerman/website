import { type CollectionEntry, getCollection } from "astro:content";
import type { ShelfBook } from "./types";

export interface ReadingSection {
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

export async function getPhotos() {
	return (await getCollection("photos")).map((photo) => photo.data);
}
