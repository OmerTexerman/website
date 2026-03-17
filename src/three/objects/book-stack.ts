import {
	BoxGeometry,
	CanvasTexture,
	Group,
	Mesh,
	MeshStandardMaterial,
	PlaneGeometry,
} from "three";
import { createBookMaterial } from "../materials";

const BOOK_COLORS = ["#2a4a6a", "#6a3a3a", "#3a5a3a", "#5a4a3a", "#4a3a6a"];

/**
 * Create a canvas texture with text for a book spine.
 * Returns a material with the text rendered onto it.
 */
function createSpineTexture(
	title: string,
	spineColor: string,
	width: number,
	height: number,
): MeshStandardMaterial {
	const canvas = document.createElement("canvas");
	const scale = 4; // resolution multiplier
	canvas.width = Math.round(width * 512 * scale);
	canvas.height = Math.round(height * 512 * scale);
	const ctx = canvas.getContext("2d");
	if (!ctx) return createBookMaterial(spineColor);

	// Background matches book color
	ctx.fillStyle = spineColor;
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	// Text
	ctx.fillStyle = "#ffffff";
	ctx.globalAlpha = 0.85;
	const fontSize = Math.round(canvas.height * 0.5);
	ctx.font = `500 ${fontSize}px 'Space Grotesk', sans-serif`;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";

	// Truncate if needed
	let displayTitle = title;
	while (ctx.measureText(displayTitle).width > canvas.width * 0.9 && displayTitle.length > 3) {
		displayTitle = `${displayTitle.slice(0, -4)}...`;
	}

	ctx.fillText(displayTitle, canvas.width / 2, canvas.height / 2);

	const texture = new CanvasTexture(canvas);
	return new MeshStandardMaterial({
		map: texture,
		roughness: 0.7,
		metalness: 0.0,
	});
}

/** Book stack → links to /reading */
export function createBookStack(books?: { title: string; spineColor: string }[]): Group {
	const stack = new Group();
	stack.userData = { interactive: true, href: "/reading", label: "Reading" };

	const bookHeight = 0.08;
	const bookDepth = 0.55;
	const count = books ? Math.min(books.length, 5) : BOOK_COLORS.length;

	for (let i = 0; i < count; i++) {
		const color = books?.[i]?.spineColor ?? BOOK_COLORS[i] ?? BOOK_COLORS[0];
		const title = books?.[i]?.title ?? "";
		const width = 0.6 + ((i * 7 + 3) % 5) * 0.05; // deterministic variation
		const geo = new BoxGeometry(width, bookHeight, bookDepth);
		const mat = createBookMaterial(color);
		const book = new Mesh(geo, mat);
		const xOffset = (((i * 3 + 1) % 3) - 1) * 0.02; // deterministic slight offset
		const yRot = (((i * 7 + 2) % 5) - 2) * 0.012; // deterministic slight rotation
		book.position.set(xOffset, bookHeight / 2 + i * (bookHeight + 0.005), 0);
		book.rotation.y = yRot;
		book.castShadow = true;
		book.userData = { title };
		stack.add(book);

		// Spine label with title text on the front face (+z)
		if (title) {
			const spineMat = createSpineTexture(title, color, width, bookHeight);
			const spineGeo = new PlaneGeometry(width * 0.95, bookHeight * 0.85);
			const spine = new Mesh(spineGeo, spineMat);
			spine.position.set(xOffset, bookHeight / 2 + i * (bookHeight + 0.005), bookDepth / 2 + 0.001);
			spine.rotation.y = yRot;
			stack.add(spine);
		}
	}

	stack.position.set(1.8, 0.12, 0.6);

	return stack;
}
