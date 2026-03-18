import { BoxGeometry, Group, Mesh, PlaneGeometry } from "three";
import { createBookMaterial } from "../materials";
import { DESK_SURFACE_Y } from "../math-utils";
import { createSpineTexture } from "../spine-texture";

const BOOK_COLORS = ["#2a4a6a", "#6a3a3a", "#3a5a3a", "#5a4a3a", "#4a3a6a"];

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
		const xOffset = (((i * 3 + 1) % 3) - 1) * 0.02; // deterministic slight offset
		const yRot = (((i * 7 + 2) % 5) - 2) * 0.012; // deterministic slight rotation
		const bookGroup = new Group();
		bookGroup.userData = { bookItem: true, bookIndex: i, title };
		bookGroup.position.set(xOffset, i * (bookHeight + 0.005), 0);
		bookGroup.rotation.y = yRot;

		const geo = new BoxGeometry(width, bookHeight, bookDepth);
		const mat = createBookMaterial(color);
		const book = new Mesh(geo, mat);
		book.position.y = bookHeight / 2;
		book.castShadow = true;
		bookGroup.add(book);

		// Spine label with title text on the front face (+z)
		if (title) {
			const spineMat = createSpineTexture(title, color, width, bookHeight, {
				fontSize: (_canvasWidth, canvasHeight) => Math.round(canvasHeight * 0.5),
				maxTextWidth: (canvasWidth) => canvasWidth * 0.9,
			});
			const spineGeo = new PlaneGeometry(width * 0.95, bookHeight * 0.85);
			const spine = new Mesh(spineGeo, spineMat);
			spine.position.set(0, bookHeight / 2, bookDepth / 2 + 0.001);
			bookGroup.add(spine);
		}

		stack.add(bookGroup);
	}

	stack.position.set(1.8, DESK_SURFACE_Y, 0.6);

	return stack;
}
