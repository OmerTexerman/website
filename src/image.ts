const CLOUDINARY_UPLOAD_RE = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(v\d+\/.+)$/;

/**
 * Insert Cloudinary on-the-fly transforms into a URL.
 * Non-Cloudinary URLs pass through unchanged.
 *
 * @example cloudinaryUrl("https://res.cloudinary.com/…/upload/v123/img.jpg", "f_auto,q_auto,w_600")
 */
export function cloudinaryUrl(src: string, transforms: string): string {
	const match = src.match(CLOUDINARY_UPLOAD_RE);
	if (!match) return src;
	return `${match[1]}${transforms}/${match[2]}`;
}
