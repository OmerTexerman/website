import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// The modules under test manipulate the DOM directly (content lists,
		// preview sanitisation) or read `window.location`, so they need a
		// document. A fixed origin keeps same-origin assertions deterministic.
		environment: "happy-dom",
		environmentOptions: {
			happyDOM: { url: "https://omer.texerman.com/" },
		},
		include: ["src/**/*.test.ts"],
		restoreMocks: true,
		unstubGlobals: true,
	},
});
