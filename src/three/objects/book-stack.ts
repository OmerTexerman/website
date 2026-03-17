import { BoxGeometry, Group, Mesh } from "three";
import { createBookMaterial } from "../materials";

const BOOK_COLORS = ["#2a4a6a", "#6a3a3a", "#3a5a3a", "#5a4a3a", "#4a3a6a"];

/** Book stack → links to /reading */
export function createBookStack(): Group {
	const stack = new Group();
	stack.userData = { interactive: true, href: "/reading", label: "Reading" };

	const bookHeight = 0.08;
	const bookDepth = 0.55;

	for (let i = 0; i < BOOK_COLORS.length; i++) {
		const width = 0.6 + Math.random() * 0.25;
		const geo = new BoxGeometry(width, bookHeight, bookDepth);
		const mat = createBookMaterial(BOOK_COLORS[i]);
		const book = new Mesh(geo, mat);
		book.position.set((Math.random() - 0.5) * 0.05, bookHeight / 2 + i * (bookHeight + 0.005), 0);
		book.rotation.y = (Math.random() - 0.5) * 0.06;
		book.castShadow = true;
		stack.add(book);
	}

	stack.position.set(1.8, 0.12, 0.6);

	return stack;
}
