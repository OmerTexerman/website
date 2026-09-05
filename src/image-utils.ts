/**
 * Cloudinary delivery helpers.
 *
 * Content files store the *original* upload URL, which for these photos means
 * full-resolution camera JPEGs — the largest in the collection is ~1.3 MB, and
 * the site ships ~15 MB of them in total. Cloudinary can resize and re-encode
 * on delivery when a transformation segment is inserted into the path, which
 * takes that same image to ~60 KB of WebP.
 *
 * A delivery URL looks like:
 *   https://res.cloudinary.com/<cloud>/image/upload/[<transforms>/]v<version>/<public_id>.<ext>
 *
 * Everything here is a no-op for non-Cloudinary sources, because book covers
 * come from openlibrary.org and local images are served straight from /public.
 */

const CLOUDINARY_UPLOAD = /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/(?=.)/;

/**
 * Cloudinary transformation segments are comma-separated `key_value` pairs
 * (`f_auto,q_auto,w_800`). A version segment (`v1774237212`) or a bare public
 * id is not a transformation, so this deliberately requires the underscore.
 */
const TRANSFORM_SEGMENT = /(?:^|,)[a-z]{1,3}_[^,/]+/;

/** Splits a transformable Cloudinary URL, or returns null if we should leave it alone. */
function splitCloudinaryUrl(src: string): { base: string; path: string } | null {
	const match = CLOUDINARY_UPLOAD.exec(src);
	if (!match) return null;

	const base = match[0].slice(0, -1); // drop the trailing slash
	const path = src.slice(match[0].length);

	// Respect a transformation somebody wrote by hand rather than stacking ours
	// on top of it — re-transforming an already-resized asset loses quality.
	const firstSegment = path.split("/", 1)[0] ?? "";
	if (TRANSFORM_SEGMENT.test(firstSegment)) return null;

	return { base, path };
}

/** True when `src` is a Cloudinary URL we can still add transformations to. */
export function isTransformableCloudinaryUrl(src: string): boolean {
	return splitCloudinaryUrl(src) !== null;
}

/**
 * Returns `src` with format/quality auto-negotiation, optionally capped to
 * `width`. Non-Cloudinary and already-transformed URLs are returned unchanged.
 *
 * `c_limit` only ever scales down, so requesting a width larger than the
 * original yields the original rather than an upscaled blur.
 */
export function cloudinaryUrl(src: string, width?: number): string {
	const parts = splitCloudinaryUrl(src);
	if (!parts) return src;

	const transforms = ["f_auto", "q_auto"];
	if (width !== undefined) transforms.push("c_limit", `w_${Math.round(width)}`);

	return `${parts.base}/${transforms.join(",")}/${parts.path}`;
}

/**
 * Builds a `srcset` for the given widths, or `undefined` when `src` cannot be
 * transformed — in which case the caller should omit the attribute entirely
 * rather than emit one entry repeated at every width.
 */
export function cloudinarySrcSet(src: string, widths: readonly number[]): string | undefined {
	if (widths.length === 0 || !isTransformableCloudinaryUrl(src)) return undefined;

	const unique = [...new Set(widths.map((w) => Math.round(w)))].sort((a, b) => a - b);
	return unique.map((w) => `${cloudinaryUrl(src, w)} ${w}w`).join(", ");
}
