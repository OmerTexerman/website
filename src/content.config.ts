import { defineCollection } from "astro:content";
import { file, glob } from "astro/loaders";
import { z } from "astro/zod";

const hexColor = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const photoSource = /^(?:\/|https?:\/\/).+/i;

const blog = defineCollection({
	loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
	schema: z.object({
		title: z.string(),
		description: z.string(),
		pubDate: z.coerce.date(),
		updatedDate: z.coerce.date().optional(),
		tags: z.array(z.string()).optional(),
		draft: z.boolean().default(false),
		featured: z.boolean().default(false),
	}),
});

const projects = defineCollection({
	loader: glob({ pattern: "**/*.md", base: "./src/content/projects" }),
	schema: z.object({
		title: z.string(),
		description: z.string(),
		tech: z.array(z.string()),
		url: z.url().optional(),
		repo: z.url().optional(),
		order: z.number().default(0),
		image: z.string().optional(),
		relatedPosts: z.array(z.string()).optional(),
	}),
});

const books = defineCollection({
	loader: file("./src/content/books/currently-reading.yaml"),
	schema: z.object({
		title: z.string(),
		author: z.string(),
		spineColor: z.string().regex(hexColor).default("#2a4a6a"),
		textColor: z.string().regex(hexColor).default("#f0ece4"),
		status: z.enum(["reading", "finished", "want-to-read"]),
		url: z.url().optional(),
		coverImage: z.string().optional(),
		review: z.string().optional(),
		rating: z.number().min(1).max(5).optional(),
		pageCount: z.number().optional(),
	}),
});

const photos = defineCollection({
	loader: file("./src/content/photos/gallery.yaml"),
	schema: z.object({
		src: z.string().regex(photoSource, "Photo src must be an absolute path or URL."),
		alt: z.string(),
		caption: z.string().optional(),
		description: z.string().optional(),
		collection: z.string().default("Uncategorized"),
		date: z.coerce.date().optional(),
	}),
});

export const collections = { blog, projects, books, photos };
