/** The canonical origin for the site — used by Astro and meta tags. */
export const siteOrigin = import.meta.env.PUBLIC_SITE_ORIGIN || "https://omer.texerman.com";

export const brandTheme = {
	dark: "#1e1e1e",
	darkSurface: "#2a2a2a",
	darkSurfaceElevated: "#312f2d",
	accent: "#c4453a",
	accentHover: "#d65248",
	cream: "#f0ece4",
	creamDark: "#e0dbd2",
	muted: "#8a8a8a",
	mutedLight: "#b0b0b0",
} as const;

const rootThemeVars = {
	"--theme-color-dark": brandTheme.dark,
	"--theme-color-dark-surface": brandTheme.darkSurface,
	"--theme-color-dark-surface-elevated": brandTheme.darkSurfaceElevated,
	"--theme-color-accent": brandTheme.accent,
	"--theme-color-accent-hover": brandTheme.accentHover,
	"--theme-color-cream": brandTheme.cream,
	"--theme-color-cream-dark": brandTheme.creamDark,
	"--theme-color-muted": brandTheme.muted,
	"--theme-color-muted-light": brandTheme.mutedLight,
} as const;

export function getRootThemeStyle(): string {
	return Object.entries(rootThemeVars)
		.map(([name, value]) => `${name}: ${value}`)
		.join("; ");
}

/**
 * Site-wide configuration — edit this file to update links, metadata,
 * social profiles, and navigation across the entire site.
 *
 * Any optional field left undefined or empty will cause the
 * corresponding UI element to not render.
 */
export const site = {
	name: "Omer Texerman",
	title: "Developer, Student, Man of your dreams",
	initials: "OT",
	description:
		"Student at Northeastern University studying Computer Engineering and Computer Science :)",
	shortDescription: "This is my site lol",
	origin: siteOrigin,
} as const;

export const homeLink = {
	label: "Desk",
	href: "/",
	backLabel: "Back to desk",
} as const;

const sectionOrder = ["blog", "projects", "reading", "photos"] as const;

export type SectionId = (typeof sectionOrder)[number];

export interface SiteSection {
	id: SectionId;
	label: string;
	href: `/${string}`;
	description: string;
	backLabel: string;
}

export const sections: Record<SectionId, SiteSection> = {
	blog: {
		id: "blog",
		label: "Blog",
		href: "/blog",
		description: "Writings",
		backLabel: "Back to blog",
	},
	projects: {
		id: "projects",
		label: "Projects",
		href: "/projects",
		description: "Shit I do",
		backLabel: "Back to projects",
	},
	reading: {
		id: "reading",
		label: "Reading",
		href: "/reading",
		description: "Shit I read",
		backLabel: "Back to reading",
	},
	photos: {
		id: "photos",
		label: "Photos",
		href: "/photos",
		description: "Shit I take pictures of",
		backLabel: "Back to photos",
	},
};

export const orderedSections = sectionOrder.map((id) => sections[id]);

function normalizeSectionHref(href: string): string {
	if (href === "" || href === "/") return "/";
	return href.endsWith("/") ? href.slice(0, -1) : href;
}

export function getSectionById(id: SectionId): SiteSection {
	return sections[id];
}

export function getSectionByHref(href: string): SiteSection | undefined {
	const normalizedHref = normalizeSectionHref(href);
	return orderedSections.find((section) => section.href === normalizedHref);
}

export function getSectionPageTitle(section: SiteSection): string {
	return `${section.label} | ${site.name}`;
}

export function getBackLabel(href: string): string {
	const normalizedHref = normalizeSectionHref(href);
	if (normalizedHref === homeLink.href) return homeLink.backLabel;
	return getSectionByHref(normalizedHref)?.backLabel ?? "Go back";
}

export function getSiteUrl(contextSite?: URL | null): URL {
	return contextSite ?? new URL(site.origin);
}

export const blogFeed = {
	title: `${site.name}'s Blog`,
	description: sections.blog.description,
} as const;

export const webManifest = {
	name: site.name,
	short_name: site.initials,
	description: site.shortDescription,
	start_url: "/",
	display: "standalone",
	background_color: brandTheme.dark,
	theme_color: brandTheme.accent,
	icons: [
		{
			src: "/favicon.svg",
			sizes: "any",
			type: "image/svg+xml",
		},
	],
} as const;

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

/** PostHog analytics — leave key empty to disable tracking */
export const analytics = {
	posthogKey: import.meta.env.PUBLIC_POSTHOG_KEY ?? "",
	posthogHost: import.meta.env.PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
} as const;
