import { siteOrigin } from "../site.config.mjs";

/**
 * Site-wide configuration — edit this file to update links, metadata,
 * social profiles, and navigation across the entire site.
 *
 * Any optional field left undefined or empty will cause the
 * corresponding UI element to not render.
 */

export const site = {
	name: "Omer Texerman",
	title: "Full Stack Developer",
	initials: "OT",
	description:
		"Full Stack Developer — explore my interactive 3D desk to discover blog posts, projects, reading list, and photos.",
	url: siteOrigin,
};

/**
 * Social links — remove an entry or leave url empty to hide it.
 * Icons are SVG path data for a 24x24 viewBox.
 */
export const socials: { label: string; url: string; icon: string }[] = [
	{
		label: "GitHub",
		url: "https://github.com/OmerTexerman",
		icon: '<path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>',
	},
];

/**
 * Navigation items — drives desk objects, header nav, and accessible nav.
 * Remove an entry to hide that section everywhere.
 */
export const navItems: {
	label: string;
	href: string;
	description: string;
}[] = [
	{
		label: "Blog",
		href: "/blog",
		description: "Notes on building software, shipping products, and learning in public.",
	},
	{
		label: "Projects",
		href: "/projects",
		description: "Selected work spanning web apps, experiments, and production systems.",
	},
	{
		label: "Reading",
		href: "/reading",
		description: "Books I am reading, finished recently, or want to pick up next.",
	},
	{
		label: "Photos",
		href: "/photos",
		description: "A small photo journal of places, light, and moments worth keeping.",
	},
];

/** PostHog analytics — leave key empty to disable tracking */
export const analytics = {
	posthogKey: import.meta.env.PUBLIC_POSTHOG_KEY ?? "",
	posthogHost: "https://us.i.posthog.com",
};
