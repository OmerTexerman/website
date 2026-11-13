import {
	BoxGeometry,
	CanvasTexture,
	CapsuleGeometry,
	CircleGeometry,
	Color,
	CylinderGeometry,
	Group,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	type Object3D,
	PlaneGeometry,
	SphereGeometry,
	SRGBColorSpace,
	TorusGeometry,
	Vector3,
} from "three";
import { ACCENT } from "../colors";
import { applySectionInteraction } from "../interactive-section";

/**
 * "Feed me slop": a bald, big-nosed man in a tan suit, slumped in an armchair
 * with his head thrown back and mouth wide open under a standpipe, holding a
 * cardboard sign. Clicking him opens the recommendations form.
 *
 * Built at about one unit tall (seated, to the top of the pipe) and scaled by
 * `scale`. Faces +z; the origin is on the floor under the chair.
 */

const SKIN = "#e0b088";
const SUIT = "#a8845a";
const CHAIR = "#5e3a28";
const SHOE = "#3e2618";
const HAIR = "#2a1c14";
/** Grey-beige, like something from a cafeteria tray. */
const SLOP = "#c9bf9a";

/** How far the head is thrown back (radians), mouth up under the pipe. */
const HEAD_TILT = -0.65;
const NECK = new Vector3(0, 0.86, -0.02);
/** The lips, in the head's own frame. */
const LIPS = new Vector3(0, 0.06, 0.15);
/** How high above his mouth the pipe pours from. */
const POUR_DROP = 0.42;

export interface SlopGuyObject {
	root: Group;
	parts: {
		head: Group;
		lips: Object3D;
		/** The pour from the spout, scaled along y from 0 (off) to 1. */
		stream: Mesh;
		drip: Mesh;
		/** Spout tip and mouth, in the body's frame. */
		spout: Vector3;
		mouth: Vector3;
	};
}

function mat(color: string, roughness = 0.75, extra: Partial<MeshStandardMaterial> = {}) {
	return new MeshStandardMaterial({ color: new Color(color), roughness, metalness: 0, ...extra });
}

function box(w: number, h: number, d: number, material: MeshStandardMaterial, x = 0, y = 0, z = 0) {
	const m = new Mesh(new BoxGeometry(w, h, d), material);
	m.position.set(x, y, z);
	return m;
}

/** A capsule running from `a` to `b`. */
function limb(a: Vector3, b: Vector3, radius: number, material: MeshStandardMaterial): Mesh {
	const dir = new Vector3().subVectors(b, a);
	const m = new Mesh(new CapsuleGeometry(radius, Math.max(dir.length(), 0.001), 4, 10), material);
	m.position.copy(a).addScaledVector(dir, 0.5);
	m.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize());
	return m;
}

/** A soft dark blob on the floor under him: the room's shadow-casting lights
 *  don't reach this corner. */
function createFloorShadow(): Mesh {
	const canvas = document.createElement("canvas");
	canvas.width = 64;
	canvas.height = 64;
	const ctx = canvas.getContext("2d");
	if (ctx) {
		const fade = ctx.createRadialGradient(32, 32, 6, 32, 32, 32);
		fade.addColorStop(0, "rgba(0,0,0,0.7)");
		fade.addColorStop(0.55, "rgba(0,0,0,0.45)");
		fade.addColorStop(1, "rgba(0,0,0,0)");
		ctx.fillStyle = fade;
		ctx.fillRect(0, 0, 64, 64);
	}
	const blob = new Mesh(
		new PlaneGeometry(1, 1),
		new MeshBasicMaterial({ map: new CanvasTexture(canvas), transparent: true, depthWrite: false }),
	);
	blob.rotation.x = -Math.PI / 2;
	blob.position.y = 0.004;
	return blob;
}

function createArmchair(): Group {
	const chair = new Group();
	const leather = mat(CHAIR, 0.6);
	const wood = mat("#2e1c12", 0.8);
	chair.add(box(0.62, 0.3, 0.52, leather, 0, 0.21, 0));
	// A seat cushion with a slight crown.
	chair.add(box(0.44, 0.05, 0.46, mat("#6b4430", 0.65), 0, 0.385, 0.02));
	const back = box(0.62, 0.62, 0.13, leather, 0, 0.66, -0.2);
	back.rotation.x = -0.12;
	chair.add(back);
	for (const side of [-1, 1]) {
		chair.add(box(0.1, 0.2, 0.52, leather, side * 0.26, 0.46, 0));
		for (const z of [-0.22, 0.22]) chair.add(box(0.05, 0.06, 0.05, wood, side * 0.27, 0.03, z));
	}
	return chair;
}

function createHead(skin: MeshStandardMaterial): { head: Group; lips: Group } {
	const head = new Group();
	// One big bald oval, from the crown down past the mouth.
	const skull = new Mesh(new SphereGeometry(0.16, 32, 24), skin);
	skull.scale.set(0.95, 1.4, 0.98);
	skull.position.set(0, 0.13, 0);
	head.add(skull);

	// A fringe of dark hair round the back, below the bald dome.
	const hair = new Mesh(new TorusGeometry(0.135, 0.03, 8, 20, Math.PI * 1.1), mat(HAIR, 0.95));
	hair.rotation.set(Math.PI / 2, 0, Math.PI * 0.95);
	hair.scale.set(1, 1.05, 1.2);
	hair.position.set(0, 0.14, -0.015);
	head.add(hair);

	const white = mat("#f4f0e8", 0.4);
	const dark = mat("#141010", 0.3);
	for (const side of [-1, 1]) {
		const ear = new Mesh(new SphereGeometry(0.048, 14, 10), skin);
		ear.scale.set(0.4, 1, 0.7);
		ear.position.set(side * 0.148, 0.16, -0.02);
		head.add(ear);
		// Round eyes rolled up toward the pipe.
		const eye = new Mesh(new SphereGeometry(0.036, 16, 12), white);
		eye.scale.set(1, 1.1, 0.6);
		eye.position.set(side * 0.06, 0.255, 0.128);
		head.add(eye);
		const pupil = new Mesh(new SphereGeometry(0.014, 10, 8), dark);
		pupil.position.set(side * 0.06, 0.276, 0.144);
		head.add(pupil);
		// Raised at the inner ends: eager, hopeful, not cross.
		const brow = box(0.072, 0.016, 0.022, mat(HAIR, 0.9), side * 0.062, 0.318, 0.122);
		brow.rotation.z = side * -0.28;
		head.add(brow);
	}

	// A big nose drooping toward the upper lip.
	const nose = new Mesh(new SphereGeometry(0.05, 16, 12), skin);
	nose.scale.set(0.85, 1.25, 1.2);
	nose.position.set(0, 0.17, 0.165);
	nose.rotation.x = 0.35;
	head.add(nose);

	// The mouth, wide open: a dark oval ringed by lip.
	const lips = new Group();
	lips.position.copy(LIPS);
	const lipMat = mat("#c87a66", 0.5);
	const throat = mat("#2a0e0c", 1);
	const hole = new Mesh(new SphereGeometry(0.075, 20, 14), throat);
	hole.scale.set(1, 0.75, 0.45);
	hole.position.z = -0.03;
	lips.add(hole);
	// A flat cap across the lips, so the chin and jowls behind never show
	// through the opening, however wide it stretches.
	const cap = new Mesh(new CircleGeometry(0.075, 28), throat);
	cap.scale.set(1, 0.75, 1);
	cap.position.z = 0.004;
	lips.add(cap);
	// One even ring of lip.
	const ring = new Mesh(new TorusGeometry(0.075, 0.021, 10, 32), lipMat);
	ring.scale.set(1, 0.75, 1);
	lips.add(ring);
	head.add(lips);

	return { head, lips };
}

/** The sign he holds up, in marker on cardboard. */
function createSign(): Mesh {
	const W = 512;
	const H = 340;
	const canvas = document.createElement("canvas");
	canvas.width = W;
	canvas.height = H;
	const tex = new CanvasTexture(canvas);
	tex.colorSpace = SRGBColorSpace;
	tex.anisotropy = 8;
	const draw = () => {
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		ctx.fillStyle = "#c9a57a";
		ctx.fillRect(0, 0, W, H);
		// Torn-box edges.
		ctx.strokeStyle = "#a9875e";
		ctx.lineWidth = 10;
		ctx.strokeRect(8, 8, W - 16, H - 16);
		ctx.fillStyle = "#1d1714";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.font = "700 112px 'Space Grotesk', sans-serif";
		ctx.save();
		ctx.translate(W / 2, H / 2);
		ctx.rotate(-0.04);
		ctx.fillText("FEED ME", 0, -62);
		ctx.fillStyle = ACCENT;
		ctx.fillText("SLOP", 0, 66);
		ctx.restore();
		tex.needsUpdate = true;
	};
	draw();
	void document.fonts?.ready.then(draw);
	const card = mat("#c9a57a", 0.9);
	const face = new MeshStandardMaterial({
		map: tex,
		roughness: 0.9,
		emissive: new Color("#ffffff"),
		emissiveMap: tex,
		emissiveIntensity: 0.18,
	});
	// Box faces: +x, -x, +y, -y, +z (printed), -z.
	return new Mesh(new BoxGeometry(0.4, 0.265, 0.01), [card, card, card, card, face, card]);
}

/** A pipe out of the wall behind him, with an elbow down into a spout
 *  straight over his mouth. */
function createPipe(spout: Vector3, wallZ: number): Group {
	const pipe = new Group();
	const metal = mat("#8d8a82", 0.45, { metalness: 0.55 });
	const r = 0.045;
	const y = spout.y + 0.09;
	const run = spout.z - wallZ;
	const along = (length: number, z: number, radius = r) => {
		const m = new Mesh(new CylinderGeometry(radius, radius, length, 16), metal);
		m.rotation.x = Math.PI / 2;
		m.position.set(spout.x, y, z);
		return m;
	};
	pipe.add(along(run, wallZ + run / 2));
	// Bolted to the wall: a flange, and a bracket strapping it up.
	pipe.add(along(0.03, wallZ + 0.015, r * 2));
	const bolt = mat("#5a5850", 0.5, { metalness: 0.5 });
	for (let i = 0; i < 4; i++) {
		const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
		const b = new Mesh(new CylinderGeometry(0.009, 0.009, 0.02, 6), bolt);
		b.rotation.x = Math.PI / 2;
		b.position.set(spout.x + Math.cos(a) * r * 1.5, y + Math.sin(a) * r * 1.5, wallZ + 0.035);
		pipe.add(b);
	}
	pipe.add(along(0.08, wallZ + run * 0.55, r * 1.3));
	const elbow = new Mesh(new SphereGeometry(r * 1.1, 14, 10), metal);
	elbow.position.set(spout.x, y, spout.z);
	pipe.add(elbow);
	const down = new Mesh(new CylinderGeometry(r * 1.2, r, y - spout.y, 16), metal);
	down.position.set(spout.x, (y + spout.y) / 2, spout.z);
	pipe.add(down);
	// A red valve wheel on top, like any self-respecting water main.
	const valveZ = wallZ + run * 0.25;
	const stem = new Mesh(new CylinderGeometry(0.012, 0.012, 0.09, 8), metal);
	stem.position.set(spout.x, y + 0.075, valveZ);
	pipe.add(stem);
	const wheelMat = mat("#7a2e26", 0.6);
	const wheel = new Mesh(new TorusGeometry(0.06, 0.012, 6, 20), wheelMat);
	wheel.rotation.x = Math.PI / 2;
	wheel.position.set(spout.x, y + 0.12, valveZ);
	pipe.add(wheel);
	for (const a of [0, Math.PI / 2]) {
		const spoke = box(0.12, 0.009, 0.009, wheelMat);
		spoke.rotation.y = a;
		spoke.position.copy(wheel.position);
		pipe.add(spoke);
	}
	return pipe;
}

export function createSlopGuy({
	interactive = true,
	scale = 1.55,
	wallZ = -0.32,
	turn = 0,
}: {
	interactive?: boolean;
	scale?: number;
	/** Where the wall behind him is (body units), for the pipe to come out of. */
	wallZ?: number;
	/** Turns him (and his chair) about y; the pipe stays square to the wall. */
	turn?: number;
} = {}): SlopGuyObject {
	const root = new Group();
	if (interactive) applySectionInteraction(root, "slop");
	// Hover scaling resets the root's own scale, so size the body inside it.
	const frame = new Group();
	frame.scale.setScalar(scale);
	root.add(frame);
	const body = new Group();
	body.rotation.y = turn;
	frame.add(body);

	body.add(createArmchair());
	// Wider than the chair, reaching a little forward where his feet are.
	const shadow = createFloorShadow();
	shadow.scale.set(1.05, 1.0, 1);
	shadow.position.z = 0.08;
	body.add(shadow);

	const skin = mat(SKIN, 0.6);
	const suit = mat(SUIT, 0.8);

	// A big round belly straining a buttoned jacket, shirt and tie down the front.
	const torsoCenter = new Vector3(0, 0.63, -0.01);
	const torso = new Mesh(new SphereGeometry(0.2, 28, 20), suit);
	torso.scale.set(1.08, 1.12, 1.05);
	torso.position.copy(torsoCenter);
	body.add(torso);
	const belly = new Mesh(new SphereGeometry(0.17, 24, 18), suit);
	belly.position.set(0, 0.55, 0.06);
	body.add(belly);
	const wedge = (
		phiHalf: number,
		theta: [number, number],
		radius: number,
		m: MeshStandardMaterial,
		phiCenter = Math.PI / 2,
	) => {
		const g = new SphereGeometry(
			radius,
			12,
			14,
			phiCenter - phiHalf,
			phiHalf * 2,
			theta[0],
			theta[1],
		);
		const w = new Mesh(g, m);
		w.scale.copy(torso.scale);
		w.position.copy(torsoCenter);
		return w;
	};
	body.add(wedge(0.3, [0.1, 0.8], 0.202, mat("#f2eee6", 0.6)));
	body.add(wedge(0.07, [0.16, 0.95], 0.205, mat(ACCENT, 0.6)));
	// Lapels either side of the shirt, a shade darker than the jacket.
	const lapel = mat("#8f6f49", 0.8);
	for (const side of [-1, 1]) {
		body.add(wedge(0.12, [0.1, 0.75], 0.206, lapel, Math.PI / 2 - side * 0.4));
	}
	// One jacket button, doing its best across the belly.
	const button = new Mesh(new SphereGeometry(0.015, 8, 6), mat("#3a2a1c", 0.4));
	button.position.set(0, 0.6, 0.225);
	body.add(button);
	const neck = new Mesh(new CylinderGeometry(0.065, 0.08, 0.1, 12), skin);
	neck.position.set(0, 0.85, -0.03);
	body.add(neck);

	const cuff = mat("#f2eee6", 0.6);
	for (const side of [-1, 1]) {
		const x = side * 0.09;
		// Thick thighs forward along the seat, shins down, shoes on the floor.
		body.add(limb(new Vector3(x, 0.45, -0.04), new Vector3(x, 0.45, 0.25), 0.085, suit));
		body.add(limb(new Vector3(x, 0.44, 0.28), new Vector3(x * 1.1, 0.1, 0.3), 0.06, suit));
		const shoe = new Mesh(new CapsuleGeometry(0.045, 0.1, 4, 10), mat(SHOE, 0.35));
		shoe.rotation.x = Math.PI / 2;
		shoe.scale.set(1.1, 1, 0.75);
		shoe.position.set(x * 1.1, 0.035, 0.34);
		body.add(shoe);
		// Round shoulders, arms down onto the armrests.
		const shoulder = new Vector3(side * 0.2, 0.76, -0.04);
		const ball = new Mesh(new SphereGeometry(0.075, 14, 10), suit);
		ball.position.copy(shoulder);
		body.add(ball);
		const elbow = new Vector3(side * 0.26, 0.6, -0.02);
		const wrist = new Vector3(side * 0.26, 0.6, 0.19);
		body.add(limb(shoulder, elbow, 0.058, suit));
		body.add(limb(elbow, wrist, 0.052, suit));
		const cuffRing = new Mesh(new CylinderGeometry(0.05, 0.05, 0.025, 12), cuff);
		cuffRing.rotation.x = Math.PI / 2;
		cuffRing.position.set(side * 0.26, 0.6, 0.215);
		body.add(cuffRing);
		const hand = new Mesh(new SphereGeometry(0.048, 12, 10), skin);
		hand.scale.set(0.9, 0.75, 1.15);
		hand.position.set(side * 0.26, 0.595, 0.255);
		body.add(hand);
	}

	const head = new Group();
	head.position.copy(NECK);
	head.rotation.x = HEAD_TILT;
	// A caricature: the head a size too big for him.
	head.scale.setScalar(1.15);
	const parts = createHead(skin);
	head.add(parts.head);
	body.add(head);

	// Where the mouth ends up with the head thrown back, and a spout above it.
	// Everything that pours lives in `frame`, square to the wall.
	frame.updateMatrixWorld(true);
	const mouth = parts.lips.getWorldPosition(new Vector3());
	frame.worldToLocal(mouth);
	const spout = mouth.clone().setY(mouth.y + POUR_DROP);
	frame.add(createPipe(spout, wallZ));

	// The pour: a column from the spout to the mouth, shown when fed.
	const streamDir = new Vector3().subVectors(mouth, spout);
	const streamLen = streamDir.length();
	const streamGeo = new CylinderGeometry(0.03, 0.022, streamLen, 12, 1, true);
	// Pivot at the spout end, so scaling y grows it down toward the mouth.
	streamGeo.translate(0, -streamLen / 2, 0);
	const slop = mat(SLOP, 0.35, { emissive: new Color(SLOP), emissiveIntensity: 0.12 });
	const stream = new Mesh(streamGeo, slop);
	stream.position.copy(spout);
	stream.quaternion.setFromUnitVectors(new Vector3(0, -1, 0), streamDir.clone().normalize());
	stream.scale.y = 0.0001;
	stream.visible = false;
	frame.add(stream);

	const drip = new Mesh(new SphereGeometry(0.014, 8, 6), slop);
	drip.scale.set(1, 1.4, 1);
	drip.visible = false;
	frame.add(drip);

	const sign = createSign();
	// Held in his outer hand: the one away from the way he's turned.
	const side = turn > 0 ? -1 : 1;
	sign.position.set(side * 0.4, 1.0, 0.27);
	sign.rotation.set(-0.08, side * -0.22, side * -0.06);
	body.add(sign);
	root.updateMatrixWorld(true);
	// The stick is stapled to the back of the board and runs down into his fist.
	const handInSign = sign.worldToLocal(body.localToWorld(new Vector3(side * 0.26, 0.595, 0.255)));
	const stickTop = new Vector3(handInSign.x, 0.06, -0.014);
	const stickBottom = new Vector3(handInSign.x, handInSign.y - 0.02, -0.014);
	sign.add(limb(stickBottom, stickTop, 0.011, mat("#8a6a44", 0.8)));

	frame.traverse((child) => {
		if (child instanceof Mesh) {
			child.castShadow = true;
			child.receiveShadow = true;
		}
	});
	shadow.castShadow = false;
	shadow.receiveShadow = false;
	// Moving bits: no stale shadows.
	stream.castShadow = false;
	drip.castShadow = false;

	return { root, parts: { head, lips: parts.lips, stream, drip, spout, mouth } };
}

const DRIP_PERIOD_S = 2.6;
const DRIP_FALL_S = 0.45;

/** Idle: a drop forms at the spout every few seconds and falls into his mouth. */
export function updateSlopDrip(guy: SlopGuyObject, now: number): void {
	const { drip, spout, mouth, stream } = guy.parts;
	if (stream.visible) {
		drip.visible = false;
		return;
	}
	const t = (now / 1000) % DRIP_PERIOD_S;
	const fallStart = DRIP_PERIOD_S - DRIP_FALL_S;
	if (t < fallStart - 0.6) {
		drip.visible = false;
		return;
	}
	drip.visible = true;
	if (t < fallStart) {
		// Swelling at the spout's lip.
		const grow = (t - (fallStart - 0.6)) / 0.6;
		drip.position.copy(spout).setY(spout.y - 0.01 - grow * 0.01);
		drip.scale.setScalar(0.4 + grow * 0.6).setY((0.4 + grow * 0.6) * 1.4);
		return;
	}
	const p = (t - fallStart) / DRIP_FALL_S;
	drip.scale.set(1, 1.4, 1);
	drip.position.lerpVectors(spout, mouth, p * p);
}
