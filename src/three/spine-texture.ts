import { CanvasTexture, MeshStandardMaterial } from "three";
import { SPINE_TEXT } from "./colors";
import { createBookMaterial } from "./materials";

export interface SpineTextureOptions {
	canvasScale?: number;
	fontSize: (canvasWidth: number, canvasHeight: number) => number;
	maxTextWidth: (canvasWidth: number, canvasHeight: number) => number;
	material?: {
		roughness?: number;
		metalness?: number;
	};
	textRotation?: number;
}

function truncateTitle(ctx: CanvasRenderingContext2D, title: string, maxWidth: number): string {
	let displayTitle = title;
	while (ctx.measureText(displayTitle).width > maxWidth && displayTitle.length > 3) {
		displayTitle = `${displayTitle.slice(0, -4)}...`;
	}
	return displayTitle;
}

export function createSpineTexture(
	title: string,
	spineColor: string,
	width: number,
	height: number,
	options: SpineTextureOptions,
): MeshStandardMaterial {
	const canvas = document.createElement("canvas");
	const scale = options.canvasScale ?? 4;
	canvas.width = Math.round(width * 512 * scale);
	canvas.height = Math.round(height * 512 * scale);
	const ctx = canvas.getContext("2d");
	if (!ctx) return createBookMaterial(spineColor);

	ctx.fillStyle = spineColor;
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	ctx.fillStyle = SPINE_TEXT;
	ctx.globalAlpha = 0.85;
	ctx.font = `500 ${options.fontSize(canvas.width, canvas.height)}px 'Space Grotesk', sans-serif`;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";

	const displayTitle = truncateTitle(ctx, title, options.maxTextWidth(canvas.width, canvas.height));

	ctx.save();
	if (options.textRotation !== undefined) {
		ctx.translate(canvas.width / 2, canvas.height / 2);
		ctx.rotate(options.textRotation);
		ctx.fillText(displayTitle, 0, 0);
	} else {
		ctx.fillText(displayTitle, canvas.width / 2, canvas.height / 2);
	}
	ctx.restore();

	const texture = new CanvasTexture(canvas);
	return new MeshStandardMaterial({
		map: texture,
		roughness: options.material?.roughness ?? 0.7,
		metalness: options.material?.metalness ?? 0.0,
	});
}
