import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const hexColor = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const photoSource = /^(?:\/|https?:\/\/).+/i;
const optionalPhoto = z
	.string()
	.transform((v) => v || undefined)
	.pipe(z.string().regex(photoSource, "Image must be an absolute path or URL.").optional());

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
		image: optionalPhoto,
		url: z.url().optional(),
		repo: z.url().optional(),
		order: z.number().default(0),
		post: z.string().optional(),
	}),
});

const books = defineCollection({
	loader: glob({ pattern: "**/*.yaml", base: "./src/content/books" }),
	schema: z.object({
		title: z.string(),
		author: z.string(),
		spineColor: z.string().regex(hexColor).default("#2a4a6a"),
		cover: optionalPhoto,
		status: z.enum(["reading", "finished", "want-to-read"]),
		url: z.url().optional(),
		post: z.string().optional(),
	}),
});

const photos = defineCollection({
	loader: glob({ pattern: "**/*.yaml", base: "./src/content/photos" }),
	schema: z.object({
		title: z.string(),
		location: z.string().optional(),
		date: z.string().optional(),
		description: z.string().optional(),
		cover: z.string().regex(photoSource, "Cover must be an absolute path or URL."),
		post: z.string().optional(),
		photos: z.array(
			z.object({
				src: z.string().regex(photoSource, "Photo src must be an absolute path or URL."),
				alt: z.string(),
				caption: z.string().optional(),
			}),
		),
	}),
});

const words = defineCollection({
	loader: glob({ pattern: "**/*.yaml", base: "./src/content/words" }),
	schema: z.object({
		word: z.string(),
		partOfSpeech: z.string().optional(),
		quip: z.string(),
		date: z.coerce.date().transform((d) => {
			// Shift to noon UTC so the date displays correctly in any timezone
			const noon = new Date(d);
			noon.setUTCHours(12, 0, 0, 0);
			return noon;
		}),
		image: optionalPhoto,
	}),
});

export const collections = { blog, projects, books, photos, words };
