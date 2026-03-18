import { BoxGeometry, Group, Mesh, PlaneGeometry } from "three";
import { BOOK_COLORS, PAGE_DARK, PAGE_LEFT, PAGE_LIGHT, PAGE_MID, PAGE_RIGHT } from "../colors";
import { applySectionInteraction } from "../interactive-section";
import { createBookMaterial, paperMaterial } from "../materials";
import { DESK_SURFACE_Y } from "../math-utils";
import { createSpineTexture } from "../spine-texture";

const BOOK_HEIGHT = 0.08;
const BOOK_GAP = 0.005;
const BOOK_DEPTH = 0.55;
const HERO_LOOSE_PAGE_COUNT = 20;

export interface BookStackObject {
	root: Group;
	parts: {
		books: Group[];
		hero: Group | null;
		lowerBooks: Group[];
		backCoverPivot?: Group;
		leftPageBlockPivot?: Group;
		rightPageBlockPivot?: Group;
		middlePageFanPivot?: Group;
		frontCoverPivot?: Group;
		loosePagePivots: Group[];
	};
}

interface HeroBookObject {
	root: Group;
	parts: {
		backCoverPivot: Group;
		leftPageBlockPivot: Group;
		rightPageBlockPivot: Group;
		middlePageFanPivot: Group;
		frontCoverPivot: Group;
		loosePagePivots: Group[];
	};
}

function createStackBook(
	index: number,
	title: string,
	color: string,
	width: number,
	bookHeight: number,
	bookDepth: number,
): Group {
	const xOffset = (((index * 3 + 1) % 3) - 1) * 0.02; // deterministic slight offset
	const yRot = (((index * 7 + 2) % 5) - 2) * 0.012; // deterministic slight rotation
	const bookGroup = new Group();
	bookGroup.position.set(xOffset, index * (bookHeight + BOOK_GAP), 0);
	bookGroup.rotation.y = yRot;

	const geo = new BoxGeometry(width, bookHeight, bookDepth);
	const mat = createBookMaterial(color);
	const book = new Mesh(geo, mat);
	book.position.y = bookHeight / 2;
	book.castShadow = true;
	bookGroup.add(book);

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

	return bookGroup;
}

function createHeroBook(
	index: number,
	title: string,
	color: string,
	width: number,
	bookHeight: number,
	bookDepth: number,
): HeroBookObject {
	const xOffset = (((index * 3 + 1) % 3) - 1) * 0.02;
	const yRot = (((index * 7 + 2) % 5) - 2) * 0.012;
	const coverThickness = 0.012;
	const pageBlockThickness = 0.022;
	const loosePageThickness = 0.001;
	const loosePageStep = 0.00068;
	const spineDepth = 0.048;
	const coverDepth = bookDepth - spineDepth;
	const pageDepth = coverDepth - 0.028;
	const loosePageDepth = pageDepth - 0.018;
	const looseStackThickness = (HERO_LOOSE_PAGE_COUNT - 1) * loosePageStep + loosePageThickness;
	const totalThickness = coverThickness * 2 + pageBlockThickness * 2 + looseStackThickness + 0.003;
	const hero = new Group();
	hero.position.set(xOffset, index * (bookHeight + BOOK_GAP), 0);
	hero.rotation.y = yRot;

	const coverMaterial = createBookMaterial(color);
	const leftPageMaterial = paperMaterial.clone();
	leftPageMaterial.color.set(PAGE_LEFT);
	const rightPageMaterial = paperMaterial.clone();
	rightPageMaterial.color.set(PAGE_RIGHT);
	const pageWidth = width - 0.04;
	const coverZ = -(spineDepth / 2 + coverDepth / 2);
	const pageZ = -(spineDepth / 2 + pageDepth / 2);
	const spineRoot = new Group();
	spineRoot.position.z = bookDepth / 2 - spineDepth / 2;
	hero.add(spineRoot);

	const backCoverPivot = new Group();
	spineRoot.add(backCoverPivot);

	const backCover = new Mesh(new BoxGeometry(width, coverThickness, coverDepth), coverMaterial);
	backCover.position.set(0, coverThickness / 2, coverZ);
	backCover.castShadow = true;
	backCoverPivot.add(backCover);

	const leftPageBlockPivot = new Group();
	leftPageBlockPivot.position.y = coverThickness + 0.001;
	backCoverPivot.add(leftPageBlockPivot);

	const leftPages = new Mesh(
		new BoxGeometry(pageWidth, pageBlockThickness, pageDepth),
		leftPageMaterial,
	);
	leftPages.position.set(0, pageBlockThickness / 2, pageZ);
	leftPages.castShadow = true;
	leftPages.receiveShadow = true;
	leftPageBlockPivot.add(leftPages);

	const middlePageFanPivot = new Group();
	middlePageFanPivot.position.y = coverThickness + pageBlockThickness + 0.0014;
	spineRoot.add(middlePageFanPivot);
	const loosePagePivots: Group[] = [];

	for (let i = 0; i < HERO_LOOSE_PAGE_COUNT; i++) {
		const leafWidth = Math.max(pageWidth - i * 0.0024, pageWidth * 0.84);
		const leafDepth = Math.max(loosePageDepth - i * 0.0038, loosePageDepth * 0.78);
		const leafPivot = new Group();
		leafPivot.position.y = i * loosePageStep;

		const leafMaterial = paperMaterial.clone();
		leafMaterial.color.set(i % 3 === 0 ? PAGE_LIGHT : i % 3 === 1 ? PAGE_MID : PAGE_DARK);
		const leaf = new Mesh(new BoxGeometry(leafWidth, loosePageThickness, leafDepth), leafMaterial);
		leaf.position.set(0, loosePageThickness / 2, -(spineDepth / 2 + leafDepth / 2));
		leaf.castShadow = true;
		leaf.receiveShadow = true;
		leafPivot.add(leaf);
		middlePageFanPivot.add(leafPivot);
		loosePagePivots.push(leafPivot);
	}

	const frontCoverPivot = new Group();
	frontCoverPivot.position.y = totalThickness;
	spineRoot.add(frontCoverPivot);

	const rightPageBlockPivot = new Group();
	rightPageBlockPivot.position.y = -coverThickness - 0.001;
	frontCoverPivot.add(rightPageBlockPivot);

	const rightPages = new Mesh(
		new BoxGeometry(pageWidth, pageBlockThickness, pageDepth),
		rightPageMaterial,
	);
	rightPages.position.set(0, -pageBlockThickness / 2, pageZ);
	rightPages.castShadow = true;
	rightPages.receiveShadow = true;
	rightPageBlockPivot.add(rightPages);

	const frontCover = new Mesh(new BoxGeometry(width, coverThickness, coverDepth), coverMaterial);
	frontCover.position.set(0, -coverThickness / 2, coverZ);
	frontCover.castShadow = true;
	frontCoverPivot.add(frontCover);

	const spineMesh = new Mesh(new BoxGeometry(width, totalThickness, spineDepth), coverMaterial);
	spineMesh.position.set(0, totalThickness / 2, 0);
	spineMesh.castShadow = true;
	spineRoot.add(spineMesh);

	if (title) {
		const spineMat = createSpineTexture(title, color, width, bookHeight, {
			fontSize: (_canvasWidth, canvasHeight) => Math.round(canvasHeight * 0.5),
			maxTextWidth: (canvasWidth) => canvasWidth * 0.9,
		});
		const spineGeo = new PlaneGeometry(width * 0.95, totalThickness * 0.82);
		const spineLabel = new Mesh(spineGeo, spineMat);
		spineLabel.position.set(0, totalThickness / 2, spineDepth / 2 + 0.001);
		spineRoot.add(spineLabel);
	}

	return {
		root: hero,
		parts: {
			backCoverPivot,
			leftPageBlockPivot,
			rightPageBlockPivot,
			middlePageFanPivot,
			frontCoverPivot,
			loosePagePivots,
		},
	};
}

/** Book stack → links to /reading */
export function createBookStack(books?: { title: string; spineColor: string }[]): BookStackObject {
	const stack = new Group();
	applySectionInteraction(stack, "reading");

	const count = books ? Math.min(books.length, 5) : BOOK_COLORS.length;
	const bookItems: Group[] = [];
	let heroParts: HeroBookObject["parts"] | null = null;
	let heroRoot: Group | null = null;

	for (let i = 0; i < count; i++) {
		const color = books?.[i]?.spineColor ?? BOOK_COLORS[i] ?? BOOK_COLORS[0];
		const title = books?.[i]?.title ?? "";
		const width = 0.6 + ((i * 7 + 3) % 5) * 0.05; // deterministic variation
		if (i === count - 1) {
			const hero = createHeroBook(i, title, color, width, BOOK_HEIGHT, BOOK_DEPTH);
			heroRoot = hero.root;
			heroParts = hero.parts;
			bookItems.push(hero.root);
			stack.add(hero.root);
			continue;
		}

		const book = createStackBook(i, title, color, width, BOOK_HEIGHT, BOOK_DEPTH);
		bookItems.push(book);
		stack.add(book);
	}

	stack.position.set(1.8, DESK_SURFACE_Y, 0.6);

	return {
		root: stack,
		parts: {
			books: bookItems,
			hero: heroRoot,
			lowerBooks: heroRoot ? bookItems.filter((book) => book !== heroRoot) : bookItems,
			backCoverPivot: heroParts?.backCoverPivot,
			leftPageBlockPivot: heroParts?.leftPageBlockPivot,
			rightPageBlockPivot: heroParts?.rightPageBlockPivot,
			middlePageFanPivot: heroParts?.middlePageFanPivot,
			frontCoverPivot: heroParts?.frontCoverPivot,
			loosePagePivots: heroParts?.loosePagePivots ?? [],
		},
	};
}
