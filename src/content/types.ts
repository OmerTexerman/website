import { isRecord } from "../utils";

export interface SpotlightInfo {
	title: string;
	name?: string;
	image: string;
}

function isSpotlightInfo(value: unknown): value is SpotlightInfo {
	return (
		isRecord(value) &&
		typeof value.title === "string" &&
		value.title.trim().length > 0 &&
		typeof value.image === "string" &&
		value.image.trim().length > 0 &&
		(value.name === undefined || typeof value.name === "string")
	);
}

export function parseSpotlightInfo(value: unknown): SpotlightInfo | undefined {
	if (!isRecord(value)) return undefined;
	if (!isSpotlightInfo(value)) return undefined;
	return value;
}

export const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export interface ShelfBook {
	title: string;
	spineColor: string;
}

function isShelfBook(value: unknown): value is ShelfBook {
	return (
		isRecord(value) &&
		typeof value.title === "string" &&
		value.title.trim().length > 0 &&
		typeof value.spineColor === "string" &&
		HEX_COLOR.test(value.spineColor)
	);
}

export function parseShelfBooks(value: unknown): ShelfBook[] | undefined {
	if (!Array.isArray(value)) return undefined;
	if (!value.every((entry) => isShelfBook(entry))) return undefined;
	return value;
}
