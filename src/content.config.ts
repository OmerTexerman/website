import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { HEX_COLOR } from "./content/types";

const photoSource = /^(?:\/|https?:\/\/).+/i;
const optionalPhoto = z
	.string()
	.transform((v) => v || undefined)
	.pipe(z.string().regex(photoSource, "Image must be an absolute path or URL.").optional());

const blog = defineCollection({
	loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
	schema: z.object({
		title: z.string().min(1),
		description: z.string().min(1),
		pubDate: z.coerce.date(),
		updatedDate: z.union([z.string().transform((v) => v || undefined).pipe(z.coerce.date().optional()), z.date()]).optional(),
		tags: z.array(z.string()).optional(),
		draft: z.boolean().default(false),
	}),
});

const projects = defineCollection({
	loader: glob({ pattern: "**/*.md", base: "./src/content/projects" }),
	schema: z.object({
		title: z.string().min(1),
		description: z.string().min(1),
		tech: z.array(z.string()).min(1),
		image: optionalPhoto,
		url: z
			.url()
			.regex(/^https?:\/\//, "Must be an http or https URL")
			.optional(),
		repo: z
			.url()
			.regex(/^https?:\/\//, "Must be an http or https URL")
			.optional(),
		order: z.number().default(0),
		post: z.string().optional(),
	}),
});

const books = defineCollection({
	loader: glob({ pattern: "**/*.yaml", base: "./src/content/books" }),
	schema: z.object({
		title: z.string().min(1),
		author: z.string().min(1),
		spineColor: z.string().regex(HEX_COLOR).default("#2a4a6a"),
		cover: optionalPhoto,
		status: z.enum(["reading", "finished", "want-to-read"]),
		url: z
			.url()
			.regex(/^https?:\/\//, "Must be an http or https URL")
			.optional(),
		post: z.string().optional(),
	}),
});

const photos = defineCollection({
	loader: glob({ pattern: "**/*.yaml", base: "./src/content/photos" }),
	schema: z.object({
		title: z.string().min(1),
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

const spotlight = defineCollection({
	loader: glob({ pattern: "**/*.yaml", base: "./src/content/spotlight" }),
	schema: z.object({
		title: z.string().min(1),
		name: z.string().optional(),
		image: z.string().regex(photoSource, "Image must be an absolute path or URL."),
	}),
});

const setup = defineCollection({
	loader: glob({ pattern: "**/*.yaml", base: "./src/content/setup" }),
	schema: z.object({
		categories: z.array(
			z.object({
				name: z.string(),
				items: z.array(
					z.object({
						name: z.string(),
						detail: z.string().optional(),
					}),
				),
			}),
		),
	}),
});

const words = defineCollection({
	loader: glob({ pattern: "**/*.yaml", base: "./src/content/words" }),
	schema: z.object({
		word: z.string().min(1),
		partOfSpeech: z.string().optional(),
		quip: z.string().min(1),
		date: z.coerce.date().transform((d) => {
			// Shift to noon UTC so the date displays correctly in any timezone
			const noon = new Date(d);
			noon.setUTCHours(12, 0, 0, 0);
			return noon;
		}),
		image: optionalPhoto,
	}),
});

export const collections = { blog, projects, books, photos, words, spotlight, setup };
