import {
	AdditiveBlending,
	BoxGeometry,
	CanvasTexture,
	Color,
	CylinderGeometry,
	Group,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	PointLight,
	Sprite,
	SpriteMaterial,
} from "three";

/**
 * A compact rangefinder-style camera, kept in the shelf's blocky style: a
 * silver top plate over a black body, a short lens, a viewfinder window and
 * a couple of dials. Front faces +z; +x is the viewer's right when looking
 * at the front. Sits on y = 0.
 */
export function createShelfCamera(): Group {
	const g = new Group();

	const W = 0.44;
	const D = 0.12;
	const LOWER_H = 0.17;
	const TOP_H = 0.09;
	const H = LOWER_H + TOP_H;

	const silver = new MeshStandardMaterial({
		color: new Color(0xbdbcb7),
		roughness: 0.45,
		metalness: 0.6,
	});
	const black = new MeshStandardMaterial({
		color: new Color(0x1b1b1c),
		roughness: 0.85,
		metalness: 0.1,
	});
	// Deep blue rather than black, so the lens reads as glass, not a hole.
	const glass = new MeshStandardMaterial({
		color: new Color(0x23365a),
		roughness: 0.2,
		metalness: 0.3,
		emissive: new Color(0x16223a),
		emissiveIntensity: 0.6,
	});
	const glint = new MeshBasicMaterial({ color: new Color(0xc9d6ea) });

	const lower = new Mesh(new BoxGeometry(W, LOWER_H, D), black);
	lower.position.y = LOWER_H / 2;
	g.add(lower);

	const top = new Mesh(new BoxGeometry(W, TOP_H, D), silver);
	top.position.y = LOWER_H + TOP_H / 2;
	g.add(top);

	// Short lens, a little left of centre.
	const lensX = -0.035;
	const lensY = LOWER_H * 0.55;
	const lens = new Group();
	lens.position.set(lensX, lensY, D / 2);
	lens.rotation.x = Math.PI / 2;
	g.add(lens);

	const barrel = new Mesh(new CylinderGeometry(0.075, 0.075, 0.05, 16), silver);
	barrel.position.y = 0.025;
	lens.add(barrel);
	const front = new Mesh(new CylinderGeometry(0.068, 0.068, 0.02, 16), black);
	front.position.y = 0.06;
	lens.add(front);
	const lensGlass = new Mesh(new CylinderGeometry(0.048, 0.048, 0.004, 16), glass);
	lensGlass.position.y = 0.071;
	lens.add(lensGlass);
	// A flat highlight dot: blocky shorthand for a reflection.
	const highlight = new Mesh(new CylinderGeometry(0.012, 0.012, 0.002, 10), glint);
	highlight.position.set(-0.018, 0.0735, -0.018);
	lens.add(highlight);

	// Viewfinder window, top right of the front.
	const ovf = new Mesh(new BoxGeometry(0.075, 0.045, 0.006), glass);
	ovf.position.set(W / 2 - 0.075, LOWER_H + TOP_H * 0.45, D / 2 + 0.003);
	g.add(ovf);

	// Flash window, top left of the front, and the burst it fires on tap:
	// a glow that pops and fades, plus a short light onto the shelf around.
	const flashX = -W / 2 + 0.065;
	const flashY = LOWER_H + TOP_H * 0.45;
	const flashWindow = new Mesh(
		new BoxGeometry(0.06, 0.035, 0.006),
		new MeshStandardMaterial({ color: new Color(0xe8e6df), roughness: 0.3, metalness: 0.1 }),
	);
	flashWindow.position.set(flashX, flashY, D / 2 + 0.003);
	g.add(flashWindow);

	const burst = new Sprite(
		new SpriteMaterial({
			map: createBurstTexture(),
			color: new Color(0xfff8ec),
			transparent: true,
			opacity: 0,
			blending: AdditiveBlending,
			depthWrite: false,
		}),
	);
	burst.position.set(flashX, flashY, D / 2 + 0.03);
	burst.visible = false;
	g.add(burst);

	const flashLight = new PointLight(new Color(0xfff4e0), 0, 3, 1.5);
	flashLight.position.set(flashX, flashY, D / 2 + 0.12);
	g.add(flashLight);
	g.userData.flash = { burst, flashLight };

	// Top: shutter-speed dial, shutter button, hot shoe.
	const dial = new Mesh(new CylinderGeometry(0.045, 0.045, 0.03, 16), silver);
	dial.position.set(-W / 2 + 0.11, H + 0.015, -0.005);
	g.add(dial);

	const button = new Mesh(new CylinderGeometry(0.014, 0.014, 0.016, 10), silver);
	button.position.set(-W / 2 + 0.05, H + 0.008, 0.02);
	g.add(button);

	const shoe = new Mesh(new BoxGeometry(0.055, 0.01, 0.05), black);
	shoe.position.set(0.04, H + 0.005, 0);
	g.add(shoe);

	g.rotation.y = 0.15;
	return g;
}

/** A soft white disc with a bright core, for the flash burst. */
function createBurstTexture(): CanvasTexture {
	const canvas = document.createElement("canvas");
	canvas.width = 128;
	canvas.height = 128;
	const ctx = canvas.getContext("2d");
	if (ctx) {
		const fade = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
		fade.addColorStop(0, "rgba(255,255,255,1)");
		fade.addColorStop(0.25, "rgba(255,255,255,0.8)");
		fade.addColorStop(1, "rgba(255,255,255,0)");
		ctx.fillStyle = fade;
		ctx.fillRect(0, 0, 128, 128);
	}
	return new CanvasTexture(canvas);
}
