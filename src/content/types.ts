const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export interface ShelfBook {
	title: string;
	spineColor: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export function isShelfBook(value: unknown): value is ShelfBook {
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
