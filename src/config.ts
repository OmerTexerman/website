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

const sectionOrder = ["blog", "projects", "reading", "photos", "wordOfTheDay"] as const;

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
	wordOfTheDay: {
		id: "wordOfTheDay",
		label: "Word of the Day",
		href: "/word-of-the-day",
		description: "Daily dose of vocab",
		backLabel: "Back to words",
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
 * Icons use Iconify names from the simple-icons set (browse at https://icon-sets.iconify.design/simple-icons/).
 */
export const socials: { label: string; url: string; icon: string }[] = [
	{
		label: "GitHub",
		url: "https://github.com/OmerTexerman",
		icon: "simple-icons:github",
	},
	{
		label: "LinkedIn",
		url: "https://www.linkedin.com/in/omer-texerman-3b50602ba",
		icon: "simple-icons:linkedin",
	},
];

/** PostHog analytics — leave key empty to disable tracking */
export const analytics = {
	posthogKey: import.meta.env.PUBLIC_POSTHOG_KEY ?? "",
	posthogHost: import.meta.env.PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
} as const;
