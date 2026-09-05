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
	integrations: [
		// `/projects/phone` and `/photos/camera` render the same content as
		// `/projects` and `/photos` in a different metaphor. They canonicalise to
		// the primary route, so keep them out of the sitemap as well.
		sitemap({
			filter: (page) => !/\/(?:projects\/phone|photos\/camera)\/?$/.test(new URL(page).pathname),
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
