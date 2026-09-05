import { describe, expect, it } from "vitest";
import { cloudinarySrcSet, cloudinaryUrl, isTransformableCloudinaryUrl } from "./image-utils";

const ORIGINAL =
	"https://res.cloudinary.com/dyzyx5v81/image/upload/v1774237212/IMG_0022_jteq6b.jpg";
const OPENLIBRARY = "https://covers.openlibrary.org/b/isbn/9780486200101-M.jpg";

describe("cloudinaryUrl", () => {
	it("inserts format and quality negotiation after /upload/", () => {
		expect(cloudinaryUrl(ORIGINAL)).toBe(
			"https://res.cloudinary.com/dyzyx5v81/image/upload/f_auto,q_auto/v1774237212/IMG_0022_jteq6b.jpg",
		);
	});

	it("adds a downscale-only width cap when asked", () => {
		expect(cloudinaryUrl(ORIGINAL, 800)).toBe(
			"https://res.cloudinary.com/dyzyx5v81/image/upload/f_auto,q_auto,c_limit,w_800/v1774237212/IMG_0022_jteq6b.jpg",
		);
	});

	it("rounds fractional widths", () => {
		expect(cloudinaryUrl(ORIGINAL, 799.6)).toContain("w_800");
	});

	it("leaves non-Cloudinary URLs untouched", () => {
		expect(cloudinaryUrl(OPENLIBRARY, 400)).toBe(OPENLIBRARY);
		expect(cloudinaryUrl("/images/local.png", 400)).toBe("/images/local.png");
		expect(cloudinaryUrl("", 400)).toBe("");
	});

	it("does not stack transformations on an already-transformed URL", () => {
		const already =
			"https://res.cloudinary.com/dyzyx5v81/image/upload/w_400,c_fill/v1774237212/IMG_0022_jteq6b.jpg";
		expect(cloudinaryUrl(already, 800)).toBe(already);
	});

	it("treats a version segment as untransformed, not as a transformation", () => {
		// `v1774237212` has no underscore, so it must not be mistaken for a
		// transformation list — otherwise every URL would be skipped.
		expect(cloudinaryUrl(ORIGINAL, 400)).toContain("f_auto,q_auto,c_limit,w_400");
	});

	it("ignores video and other non-image delivery paths", () => {
		const video = "https://res.cloudinary.com/dyzyx5v81/video/upload/v1/clip.mp4";
		expect(cloudinaryUrl(video, 400)).toBe(video);
	});
});

describe("isTransformableCloudinaryUrl", () => {
	it("is true for a bare Cloudinary image URL", () => {
		expect(isTransformableCloudinaryUrl(ORIGINAL)).toBe(true);
	});

	it("is false for other hosts and for already-transformed URLs", () => {
		expect(isTransformableCloudinaryUrl(OPENLIBRARY)).toBe(false);
		expect(
			isTransformableCloudinaryUrl("https://res.cloudinary.com/x/image/upload/f_auto/v1/a.jpg"),
		).toBe(false);
	});
});

describe("cloudinarySrcSet", () => {
	it("emits one candidate per width with a w descriptor", () => {
		const srcset = cloudinarySrcSet(ORIGINAL, [320, 640]);
		expect(srcset).toBe(
			"https://res.cloudinary.com/dyzyx5v81/image/upload/f_auto,q_auto,c_limit,w_320/v1774237212/IMG_0022_jteq6b.jpg 320w, " +
				"https://res.cloudinary.com/dyzyx5v81/image/upload/f_auto,q_auto,c_limit,w_640/v1774237212/IMG_0022_jteq6b.jpg 640w",
		);
	});

	it("sorts and de-duplicates widths", () => {
		expect(cloudinarySrcSet(ORIGINAL, [640, 320, 640])).toBe(
			cloudinarySrcSet(ORIGINAL, [320, 640]),
		);
	});

	it("returns undefined when the source cannot be transformed", () => {
		// The caller omits the attribute entirely rather than emitting the same
		// URL at every width, which would mislead the browser's picker.
		expect(cloudinarySrcSet(OPENLIBRARY, [320, 640])).toBeUndefined();
		expect(cloudinarySrcSet("/images/local.png", [320])).toBeUndefined();
	});

	it("returns undefined for an empty width list", () => {
		expect(cloudinarySrcSet(ORIGINAL, [])).toBeUndefined();
	});
});
