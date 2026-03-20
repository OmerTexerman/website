import { BoxGeometry, Group, Mesh, PlaneGeometry } from "three";
import { applySectionInteraction } from "../interactive-section";
import {
	dictionaryGoldMaterial,
	dictionaryLeatherMaterial,
	dictionaryPagesMaterial,
} from "../materials";
import { DESK_SURFACE_Y } from "../math-utils";

export interface DictionaryObject {
	root: Group;
	parts: {
		coverPivot: Group;
		pages: Mesh[];
	};
}

/** Dictionary → links to /word-of-the-day
 *  A thick leather-bound dictionary sitting on the desk.
 *  The top cover pivots open at the spine like the notebook.
 */
export function createDictionary(): DictionaryObject {
	const dictionary = new Group();
	applySectionInteraction(dictionary, "wordOfTheDay");

	const width = 0.65;
	const depth = 0.8;
	const thickness = 0.14;
	const coverThickness = 0.02;

	// Bottom cover
	const bottomGeo = new BoxGeometry(width, coverThickness, depth);
	const bottom = new Mesh(bottomGeo, dictionaryLeatherMaterial);
	bottom.position.set(0, coverThickness / 2, 0);
	bottom.castShadow = true;
	dictionary.add(bottom);

	// Pages block (thick)
	const pagesHeight = thickness - coverThickness * 2;
	const pagesGeo = new BoxGeometry(width - 0.04, pagesHeight, depth - 0.04);
	const pagesMesh = new Mesh(pagesGeo, dictionaryPagesMaterial);
	pagesMesh.position.set(0, coverThickness + pagesHeight / 2, 0);
	dictionary.add(pagesMesh);

	// Loose page sheets visible from the side (give page-edge texture)
	const pageEdges: Mesh[] = [];
	const edgeCount = 6;
	for (let i = 0; i < edgeCount; i++) {
		const t = i / (edgeCount - 1);
		const y = coverThickness + pagesHeight * 0.1 + pagesHeight * 0.8 * t;
		const edgeGeo = new PlaneGeometry(width - 0.05, 0.001);
		const edge = new Mesh(edgeGeo, dictionaryPagesMaterial);
		edge.rotation.x = -Math.PI / 2;
		edge.position.set(0, y, 0);
		dictionary.add(edge);
		pageEdges.push(edge);
	}

	// Top cover — pivots at the spine (back edge, z = -depth/2)
	const coverPivot = new Group();
	coverPivot.position.set(0, coverThickness + pagesHeight, -depth / 2);
	dictionary.add(coverPivot);

	const topCoverGeo = new BoxGeometry(width, coverThickness, depth);
	const topCover = new Mesh(topCoverGeo, dictionaryLeatherMaterial);
	topCover.position.set(0, coverThickness / 2, depth / 2);
	topCover.castShadow = true;
	coverPivot.add(topCover);

	// Gold title emboss on top cover
	const titleGeo = new PlaneGeometry(width * 0.5, depth * 0.08);
	const title = new Mesh(titleGeo, dictionaryGoldMaterial);
	title.rotation.x = -Math.PI / 2;
	title.position.set(0, coverThickness + 0.001, depth * 0.35);
	coverPivot.add(title);

	// Gold spine accent
	const spineGeo = new PlaneGeometry(width * 0.6, coverThickness * 0.8);
	const spine = new Mesh(spineGeo, dictionaryGoldMaterial);
	spine.position.set(0, coverThickness / 2, -0.001);
	coverPivot.add(spine);

	// Position on desk — to the right of the book stack
	dictionary.position.set(1.7, DESK_SURFACE_Y, -0.6);
	dictionary.rotation.y = -0.25;

	return {
		root: dictionary,
		parts: {
			coverPivot,
			pages: pageEdges,
		},
	};
}
