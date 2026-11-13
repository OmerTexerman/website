import {
	BoxGeometry,
	CanvasTexture,
	Color,
	CylinderGeometry,
	Group,
	Mesh,
	MeshStandardMaterial,
	SphereGeometry,
	SRGBColorSpace,
} from "three";
import { site } from "../../config";
import { ACCENT } from "../colors";
import { applySectionInteraction } from "../interactive-section";

const BADGE_W = 0.26;
const BADGE_H = 0.38;
const BADGE_T = 0.008;
const TEX_W = 512;
const TEX_H = Math.round((TEX_W * BADGE_H) / BADGE_W);

/** The badge's printed face: a red band, the alien as the photo, name and role. */
function createBadgeFace(): MeshStandardMaterial {
	const canvas = document.createElement("canvas");
	canvas.width = TEX_W;
	canvas.height = TEX_H;
	const ctx = canvas.getContext("2d");
	const tex = new CanvasTexture(canvas);
	tex.colorSpace = SRGBColorSpace;
	tex.anisotropy = 8;
	const alien = new Image();

	const draw = () => {
		if (!ctx) return;
		const [first, ...rest] = site.name.split(" ");
		ctx.fillStyle = "#f4efe6";
		ctx.fillRect(0, 0, TEX_W, TEX_H);
		// Header band with the clip slot.
		ctx.fillStyle = ACCENT;
		ctx.fillRect(0, 0, TEX_W, 150);
		ctx.fillStyle = "#f4efe6";
		ctx.fillRect(TEX_W / 2 - 60, 30, 120, 22);
		ctx.font = "700 72px 'Space Grotesk', sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText("ME", TEX_W / 2, 102);
		// Photo box with the alien.
		const box = { x: TEX_W / 2 - 110, y: 190, w: 220, h: 250 };
		ctx.fillStyle = "#e3dccf";
		ctx.fillRect(box.x, box.y, box.w, box.h);
		if (alien.complete && alien.naturalWidth > 0) {
			const h = box.h - 30;
			const w = (h * alien.naturalWidth) / alien.naturalHeight;
			ctx.drawImage(alien, box.x + (box.w - w) / 2, box.y + 15, w, h);
		}
		// Name and role.
		ctx.fillStyle = "#211b17";
		ctx.font = "700 72px 'Space Grotesk', sans-serif";
		ctx.fillText(first, TEX_W / 2, 520);
		ctx.fillText(rest.join(" "), TEX_W / 2, 596);
		ctx.fillStyle = "#7a6a5d";
		ctx.font = "500 30px 'JetBrains Mono', monospace";
		ctx.fillText("CE + CS", TEX_W / 2, 670);
	};
	draw();
	const redraw = () => {
		draw();
		tex.needsUpdate = true;
	};
	alien.onload = redraw;
	alien.src = "/alien.svg";
	void document.fonts?.ready.then(redraw);
	// A little self-light so it reads against the dark wall.
	return new MeshStandardMaterial({
		map: tex,
		roughness: 0.55,
		metalness: 0,
		emissive: new Color("#ffffff"),
		emissiveMap: tex,
		emissiveIntensity: 0.25,
	});
}

/** The badge card, printed face toward +y, lying flat, top edge toward -z. */
function createBadgeCard(): Mesh {
	const plastic = new MeshStandardMaterial({ color: new Color("#f4efe6"), roughness: 0.55 });
	// Box faces: +x, -x, +y (face), -y, +z, -z.
	const card = new Mesh(new BoxGeometry(BADGE_W, BADGE_T, BADGE_H), [
		plastic,
		plastic,
		createBadgeFace(),
		plastic,
		plastic,
		plastic,
	]);
	// The texture is drawn top-down; on +y it maps with its top at -z.
	card.castShadow = true;
	return card;
}

export interface IdBadgeObject {
	root: Group;
	/** Badge and lanyard together, pivoting on the peg: `sway` drifts on its
	 *  own like a wind chime, `swing` (inside it) swings when clicked. */
	parts: { sway: Group; swing: Group };
}

const LANYARD_DROP = 0.42;
const STRAP_W = 0.025;
/** Draped mount: how far apart the two straps lie, how far back along the
 *  shelf they run (under the item resting on them), and the plank's
 *  thickness they bend down over. */
const DRAPE_SPREAD = 0.035;
const DRAPE_RUN = 0.2;
const DRAPE_EDGE = 0.06;
const DRAPE_FACE_Z = 0.012;

/** Wall: an ID badge hanging by its lanyard from a peg. The peg sits at the
 *  root's origin; the badge faces +z. */
export function createWallIdBadge({
	interactive = true,
	scale = 1.6,
	mount = "wall",
}: {
	/** Off when a wrapper handles clicks (the shelf's entry targets). */
	interactive?: boolean;
	scale?: number;
	/** A hook on the wall, or draped over a shelf's front edge (the origin
	 *  is then that edge; the lanyard lies back along the shelf, -z). */
	mount?: "wall" | "draped";
} = {}): IdBadgeObject {
	const root = new Group();
	if (interactive) applySectionInteraction(root, "about");

	// Everything sits in `body` so it can be scaled up: hover scaling resets
	// the clicked root's own scale.
	const body = new Group();
	body.scale.setScalar(scale);
	root.add(body);

	const brass = new MeshStandardMaterial({
		color: new Color("#c9a14e"),
		roughness: 0.35,
		metalness: 0.7,
		emissive: new Color("#c9a14e"),
		emissiveIntensity: 0.15,
	});
	if (mount === "wall") {
		// A brass wall hook: a round plate with a peg sticking out, tipped up.
		const plate = new Mesh(new CylinderGeometry(0.045, 0.045, 0.012, 16), brass);
		plate.rotation.x = Math.PI / 2;
		plate.position.z = 0.006;
		body.add(plate);
		const peg = new Mesh(new CylinderGeometry(0.014, 0.014, 0.1, 10), brass);
		peg.rotation.x = Math.PI / 2 - 0.35;
		peg.position.set(0, 0.012, 0.05);
		body.add(peg);
		const knob = new Mesh(new SphereGeometry(0.02, 10, 8), brass);
		knob.position.set(0, 0.03, 0.098);
		body.add(knob);
	} else {
		// Two straps lying on the shelf, running out from under whatever sits
		// on it to the front edge, then down over the plank's front face.
		const strapMat = new MeshStandardMaterial({ color: new Color(ACCENT), roughness: 0.8 });
		for (const side of [-1, 1]) {
			const flat = new Mesh(new BoxGeometry(STRAP_W, 0.004, DRAPE_RUN), strapMat);
			flat.position.set(side * DRAPE_SPREAD, 0.002, -DRAPE_RUN / 2);
			body.add(flat);
			const overEdge = new Mesh(new BoxGeometry(STRAP_W, DRAPE_EDGE, 0.004), strapMat);
			// Same depth as the hanging straps (the sway pivot's z), so they join flush.
			overEdge.position.set(side * DRAPE_SPREAD, -DRAPE_EDGE / 2 + 0.002, DRAPE_FACE_Z);
			body.add(overEdge);
		}
	}

	const sway = new Group();
	if (mount === "wall") sway.position.set(0, 0.01, 0.085);
	else sway.position.set(0, 0, DRAPE_FACE_Z);
	body.add(sway);
	const swing = new Group();
	sway.add(swing);

	// Lanyard: two straps down to the clip. From a hook they start together
	// and spread to the clip's ends; draped over an edge they start apart
	// (where they come over the edge) and meet at the clip.
	const strapMat = new MeshStandardMaterial({ color: new Color(ACCENT), roughness: 0.8 });
	const topSpread = mount === "wall" ? 0 : DRAPE_SPREAD;
	// Both end inside the clip's top edge, so they read as attached to it.
	const bottomSpread = 0.016;
	const topY = mount === "wall" ? 0 : -DRAPE_EDGE;
	for (const side of [-1, 1]) {
		const x0 = side * topSpread;
		const x1 = side * bottomSpread;
		const drop = LANYARD_DROP + topY;
		// Draped straps run a little up into the piece coming over the edge,
		// so no seam opens between them as the badge sways.
		const overlap = mount === "wall" ? 0 : 0.025;
		const len = Math.hypot(x1 - x0, drop) + overlap;
		const strap = new Mesh(new BoxGeometry(STRAP_W, len, 0.004), strapMat);
		strap.position.set((x0 + x1) / 2, topY - drop / 2 + overlap / 2, 0);
		strap.rotation.z = Math.atan2(x1 - x0, drop);
		swing.add(strap);
	}

	// Light brushed metal with a little self-light: a dark clip vanished
	// against the dark wall and the lanyard looked detached from the card.
	const clip = new Mesh(
		new BoxGeometry(0.055, 0.05, 0.014),
		new MeshStandardMaterial({
			color: new Color("#d4d4d0"),
			roughness: 0.3,
			metalness: 0.6,
			emissive: new Color("#d4d4d0"),
			emissiveIntensity: 0.2,
		}),
	);
	clip.position.y = -LANYARD_DROP - 0.02;
	swing.add(clip);

	// The card stood upright (face +z, top up) under the clip.
	const card = createBadgeCard();
	card.rotation.x = Math.PI / 2;
	card.position.y = -LANYARD_DROP - 0.04 - BADGE_H / 2;
	card.position.z = 0.006;
	swing.add(card);

	// It moves every frame and shadow maps only refresh on demand, so its
	// shadow on the wall would lag behind; it casts none.
	swing.traverse((child) => {
		if (child instanceof Mesh) child.castShadow = false;
	});
	return { root, parts: { sway, swing } };
}
