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

/** Wall: an ID badge hanging by its lanyard from a peg. The peg sits at the
 *  root's origin; the badge faces +z. */
export function createWallIdBadge(): IdBadgeObject {
	const root = new Group();
	applySectionInteraction(root, "about");

	// Everything sits in `body` so it can be scaled up: hover scaling resets
	// the clicked root's own scale.
	const body = new Group();
	body.scale.setScalar(1.6);
	root.add(body);

	// A brass wall hook: a round plate with a peg sticking out, tipped up.
	const brass = new MeshStandardMaterial({
		color: new Color("#c9a14e"),
		roughness: 0.35,
		metalness: 0.7,
		emissive: new Color("#c9a14e"),
		emissiveIntensity: 0.15,
	});
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

	const sway = new Group();
	sway.position.set(0, 0.01, 0.085);
	body.add(sway);
	const swing = new Group();
	sway.add(swing);

	// Lanyard: two straps from the peg down to the clip, forming a V.
	const strapMat = new MeshStandardMaterial({ color: new Color(ACCENT), roughness: 0.8 });
	const spread = 0.07;
	for (const side of [-1, 1]) {
		const dx = side * spread;
		const len = Math.hypot(dx, LANYARD_DROP);
		const strap = new Mesh(new BoxGeometry(STRAP_W, len, 0.004), strapMat);
		strap.position.set(dx / 2, -LANYARD_DROP / 2, 0);
		strap.rotation.z = Math.atan2(dx, LANYARD_DROP);
		swing.add(strap);
	}

	const clip = new Mesh(
		new BoxGeometry(0.05, 0.05, 0.012),
		new MeshStandardMaterial({ color: new Color("#9a9a96"), roughness: 0.35, metalness: 0.8 }),
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

/** Shelf: the badge leaning against the wall, face out (+z). Sits on y = 0. */
export function createShelfIdBadge(): Group {
	const g = new Group();
	const card = createBadgeCard();
	// Stand it up on its bottom edge, leaning back a little.
	card.rotation.x = Math.PI / 2 - 0.2;
	card.position.y = (BADGE_H / 2) * Math.cos(0.2);
	card.position.z = -0.03;
	g.add(card);
	return g;
}
