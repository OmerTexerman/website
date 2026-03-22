import sitemap from "@astrojs/sitemap";
import vercel from "@astrojs/vercel";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import icon from "astro-icon";
import { siteOrigin } from "./src/config.ts";

export default defineConfig({
	site: siteOrigin,
	output: "static",
	adapter: vercel(),
	integrations: [sitemap(), icon()],
	vite: {
		plugins: [tailwindcss()],
		optimizeDeps: {
			include: ["three"],
		},
	},
});
