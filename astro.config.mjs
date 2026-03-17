import sitemap from "@astrojs/sitemap";
import vercel from "@astrojs/vercel";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
	site: "https://omer.texerman.com",
	output: "static",
	adapter: vercel(),
	integrations: [sitemap()],
	vite: {
		plugins: [tailwindcss()],
	},
});
