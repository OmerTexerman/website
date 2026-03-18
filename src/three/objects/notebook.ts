import { BoxGeometry, Color, Group, Mesh, MeshStandardMaterial, TorusGeometry } from "three";
import { accentMaterial, paperMaterial } from "../materials";
import { DESK_SURFACE_Y } from "../math-utils";

/** Notebook → links to /blog
 *  The top cover is inside a pivot group positioned at the spine (back edge)
 *  so it rotates open like a real book cover.
 */
export function createNotebook(): Group {
	const notebook = new Group();
	notebook.userData = { interactive: true, href: "/blog", label: "Blog" };

	// Bottom cover
	const bottomGeo = new BoxGeometry(0.7, 0.04, 0.9);
	const bottom = new Mesh(bottomGeo, accentMaterial);
	bottom.position.set(0, 0.02, 0);
	bottom.castShadow = true;
	notebook.add(bottom);

	// Pages
	const pagesGeo = new BoxGeometry(0.65, 0.05, 0.85);
	const pages = new Mesh(pagesGeo, paperMaterial);
	pages.position.set(0, 0.065, 0);
	notebook.add(pages);

	// Top cover — wrapped in a pivot group at the spine (back edge, z = -0.45)
	const coverPivot = new Group();
	coverPivot.userData = { coverPivot: true };
	coverPivot.position.set(0, 0.09, -0.45);
	notebook.add(coverPivot);

	const coverMat = new MeshStandardMaterial({
		color: new Color("#9a3230"),
		roughness: 0.7,
		metalness: 0.05,
	});
	const topCoverGeo = new BoxGeometry(0.7, 0.04, 0.9);
	const topCover = new Mesh(topCoverGeo, coverMat);
	topCover.position.set(0, 0.02, 0.45);
	topCover.castShadow = true;
	coverPivot.add(topCover);

	// Spiral rings along the spine
	const ringMat = new MeshStandardMaterial({
		color: new Color("#c0c0c0"),
		roughness: 0.3,
		metalness: 0.8,
	});
	const ringGeo = new TorusGeometry(0.04, 0.006, 6, 12);
	const ringCount = 9;
	const spineX = 0.35; // half the cover width
	const startX = -spineX + 0.06;
	const endX = spineX - 0.06;

	for (let i = 0; i < ringCount; i++) {
		const t = ringCount > 1 ? i / (ringCount - 1) : 0.5;
		const ring = new Mesh(ringGeo, ringMat);
		ring.position.set(startX + t * (endX - startX), 0.09, -0.45);
		ring.rotation.y = Math.PI / 2;
		notebook.add(ring);
	}

	notebook.position.set(-1.5, DESK_SURFACE_Y, 0.5);
	notebook.rotation.y = 0.15;

	return notebook;
}
