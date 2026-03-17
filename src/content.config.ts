import { defineCollection } from "astro:content";
import { file, glob } from "astro/loaders";
import { z } from "astro/zod";

const blog = defineCollection({
	loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
	schema: z.object({
		title: z.string(),
		description: z.string(),
		pubDate: z.coerce.date(),
		updatedDate: z.coerce.date().optional(),
		tags: z.array(z.string()).optional(),
		draft: z.boolean().default(false),
	}),
});

const projects = defineCollection({
	loader: glob({ pattern: "**/*.md", base: "./src/content/projects" }),
	schema: z.object({
		title: z.string(),
		description: z.string(),
		tech: z.array(z.string()),
		url: z.string().url().optional(),
		repo: z.string().url().optional(),
		featured: z.boolean().default(false),
		order: z.number().default(0),
	}),
});

const books = defineCollection({
	loader: file("./src/content/books/currently-reading.yaml"),
	schema: z.object({
		title: z.string(),
		author: z.string(),
		spineColor: z.string().default("#2a4a6a"),
		status: z.enum(["reading", "finished", "want-to-read"]),
		url: z.string().url().optional(),
	}),
});

const photos = defineCollection({
	loader: file("./src/content/photos/gallery.yaml"),
	schema: z.object({
		src: z.string(),
		alt: z.string(),
		caption: z.string().optional(),
		featured: z.boolean().default(false),
	}),
});

export const collections = { blog, projects, books, photos };
