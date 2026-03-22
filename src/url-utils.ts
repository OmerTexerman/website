const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

function parseUrl(value: string, base: string | URL = window.location.origin): URL | null {
	try {
		return new URL(value, base);
	} catch {
		return null;
	}
}

function isHttpUrl(url: URL): boolean {
	return HTTP_PROTOCOLS.has(url.protocol);
}

function isSameOriginUrl(url: URL, origin = window.location.origin): boolean {
	return url.origin === origin;
}

export function getSameOriginUrl(
	value: string,
	base: string | URL = window.location.origin,
): URL | null {
	const url = parseUrl(value, base);
	if (!url || !isHttpUrl(url) || !isSameOriginUrl(url)) return null;
	return url;
}

export function toRelativeHref(url: URL): string {
	return `${url.pathname}${url.search}${url.hash}`;
}

export function getSameOriginHref(
	value: string,
	base: string | URL = window.location.origin,
): string | null {
	const url = getSameOriginUrl(value, base);
	return url ? toRelativeHref(url) : null;
}

export function isSafeHttpUrl(value: string, base: string | URL = window.location.origin): boolean {
	const url = parseUrl(value, base);
	return !!url && isHttpUrl(url);
}

export function getSameOriginReferrer(): URL | null {
	if (!document.referrer) return null;
	return getSameOriginUrl(document.referrer);
}
