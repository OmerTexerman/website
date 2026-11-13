import sitemap from "@astrojs/sitemap";
import vercel from "@astrojs/vercel";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import icon from "astro-icon";
import { siteOrigin } from "./src/config.ts";

export default defineConfig({
	site: siteOrigin,
	trailingSlash: "never",
	output: "static",
	adapter: vercel(),
	// The phone-only camera view of Photos was removed; send old links to
	// the corkboard.
	redirects: {
		"/photos/camera": { status: 301, destination: "/photos" },
	},
	integrations: [
		// `/projects/phone` renders the same content as `/projects` in a
		// different metaphor. It canonicalises to the primary route, so keep it
		// out of the sitemap as well.
		sitemap({
			filter: (page) => !/\/projects\/phone\/?$/.test(new URL(page).pathname),
		}),
		icon(),
	],
	vite: {
		plugins: [tailwindcss()],
		optimizeDeps: {
			include: [
				"three",
				"three/examples/jsm/postprocessing/EffectComposer.js",
				"three/examples/jsm/postprocessing/RenderPass.js",
				"three/examples/jsm/postprocessing/UnrealBloomPass.js",
			],
		},
	},
});
