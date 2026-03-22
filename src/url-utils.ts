const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

function getDefaultOrigin(): string {
	return typeof window !== "undefined" ? window.location.origin : "http://localhost";
}

function parseUrl(value: string, base: string | URL = getDefaultOrigin()): URL | null {
	try {
		return new URL(value, base);
	} catch {
		return null;
	}
}

function isHttpUrl(url: URL): boolean {
	return HTTP_PROTOCOLS.has(url.protocol);
}

function isSameOriginUrl(url: URL, origin = getDefaultOrigin()): boolean {
	return url.origin === origin;
}

function getBaseOrigin(base: string | URL = getDefaultOrigin()): string {
	const url = parseUrl("/", base);
	return url?.origin ?? getDefaultOrigin();
}

export function getSameOriginUrl(
	value: string,
	base: string | URL = getDefaultOrigin(),
): URL | null {
	const url = parseUrl(value, base);
	if (!url || !isHttpUrl(url) || !isSameOriginUrl(url, getBaseOrigin(base))) return null;
	return url;
}

export function toRelativeHref(url: URL): string {
	return `${url.pathname}${url.search}${url.hash}`;
}

export function getSameOriginHref(
	value: string,
	base: string | URL = getDefaultOrigin(),
): string | null {
	const url = getSameOriginUrl(value, base);
	return url ? toRelativeHref(url) : null;
}

export function isSafeHttpUrl(value: string, base: string | URL = getDefaultOrigin()): boolean {
	const url = parseUrl(value, base);
	return !!url && isHttpUrl(url);
}

export function getSameOriginReferrer(): URL | null {
	if (typeof document === "undefined") return null;
	if (!document.referrer) return null;
	return getSameOriginUrl(document.referrer);
}
