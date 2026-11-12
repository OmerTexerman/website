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
	PlaneGeometry,
	ShaderChunk,
	SRGBColorSpace,
} from "three";

/** Board wood: dark enough for the lettering to pop, not so dark it reads as a slab. */
const SIGN_WOOD = "#4a2d18";

export interface GreetingSignOptions {
	title: string;
	line: string;
	/** Board width in world units; height follows the canvas aspect. */
	width: number;
	/** Text self-light: brightens the letters. Keep it low; `halo` does the glow. */
	glow?: number;
	/** Draw the sign's own soft glow around the lettering, for scenes without
	 *  bloom. The value is the glow's strength (0–1). */
	halo?: number;
}

const CANVAS_W = 1024;
/** Mipmapping blends toward a half-size copy of the texture, which leaves
 *  small lettering a pixel soft. Biasing the lookup toward the full-size
 *  level keeps it crisp at the cost of a little aliasing. */
const TEXT_LOD_BIAS = -0.8;
const CANVAS_H = 320;
/** Canvas pixels per layout unit, so the sign stays sharp on large hi-DPI screens. */
const TEXTURE_SCALE = 2;
const TEXT_COLOR = "#fff3df";
/** Text self-light; just under where the bloom pass starts to haze it. */
const SIGN_GLOW = 0.2;

/** Draws the board. With `glowOnly`, just the lettering on black, for the
 *  emissive map, so the text gives off a faint light and the wood doesn't. */
function drawSign(
	ctx: CanvasRenderingContext2D,
	title: string,
	line: string,
	glowOnly = false,
): void {
	ctx.setTransform(TEXTURE_SCALE, 0, 0, TEXTURE_SCALE, 0, 0);
	ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
	ctx.fillStyle = glowOnly ? "#000" : SIGN_WOOD;
	ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
	if (!glowOnly) drawGrain(ctx);
	drawText(ctx, title, line);
}

function drawGrain(ctx: CanvasRenderingContext2D): void {
	ctx.globalAlpha = 0.18;
	ctx.strokeStyle = "#1c1008";
	for (let i = 0; i < 14; i++) {
		const y = 18 + i * 22 + Math.sin(i * 1.7) * 6;
		ctx.lineWidth = 1 + (i % 3);
		ctx.beginPath();
		ctx.moveTo(0, y);
		ctx.bezierCurveTo(CANVAS_W * 0.3, y + 6, CANVAS_W * 0.7, y - 6, CANVAS_W, y + 2);
		ctx.stroke();
	}
	ctx.globalAlpha = 1;
}

/** Crisp lettering. Near-white so it reads as lit; the brightness itself
 *  comes from the emissive map, kept just under the bloom threshold so the
 *  letters stay sharp instead of hazing over the board. */
function drawText(ctx: CanvasRenderingContext2D, title: string, line: string): void {
	ctx.fillStyle = TEXT_COLOR;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.font = "700 112px 'Space Grotesk', sans-serif";
	ctx.fillText(title, CANVAS_W / 2, CANVAS_H * 0.4);
	ctx.globalAlpha = 0.9;
	ctx.font = "600 40px 'JetBrains Mono', monospace";
	ctx.fillText(line, CANVAS_W / 2, CANVAS_H * 0.76);
	ctx.globalAlpha = 1;
}

/** Only the blurred light around the letters (the letters themselves stay
 *  crisp on the board below), drawn as an offset shadow of off-canvas text. */
function createHaloTexture(title: string, line: string): CanvasTexture {
	const canvas = document.createElement("canvas");
	canvas.width = CANVAS_W;
	canvas.height = CANVAS_H;
	const ctx = canvas.getContext("2d");
	const tex = new CanvasTexture(canvas);
	tex.colorSpace = SRGBColorSpace;
	const draw = () => {
		if (!ctx) return;
		const away = CANVAS_W * 2;
		ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillStyle = "#000";
		ctx.shadowColor = "rgba(255, 190, 110, 1)";
		ctx.shadowOffsetX = away;
		ctx.font = "700 112px 'Space Grotesk', sans-serif";
		for (const blur of [6, 14, 26]) {
			ctx.shadowBlur = blur;
			ctx.fillText(title, CANVAS_W / 2 - away, CANVAS_H * 0.4);
		}
		ctx.font = "600 40px 'JetBrains Mono', monospace";
		ctx.shadowBlur = 8;
		ctx.globalAlpha = 0.85;
		ctx.fillText(line, CANVAS_W / 2 - away, CANVAS_H * 0.76);
		ctx.globalAlpha = 1;
	};
	draw();
	void document.fonts?.ready.then(() => {
		if (canvas.width !== CANVAS_W) return;
		draw();
		tex.needsUpdate = true;
	});
	return tex;
}

function createSignTexture(title: string, line: string, glowOnly: boolean): CanvasTexture {
	const canvas = document.createElement("canvas");
	canvas.width = CANVAS_W * TEXTURE_SCALE;
	canvas.height = CANVAS_H * TEXTURE_SCALE;
	const ctx = canvas.getContext("2d");
	const tex = new CanvasTexture(canvas);
	tex.colorSpace = SRGBColorSpace;
	tex.anisotropy = 8;
	if (ctx) {
		drawSign(ctx, title, line, glowOnly);
		// The site fonts may still be loading; redraw once they are in.
		void document.fonts?.ready.then(() => {
			if (canvas.width !== CANVAS_W * TEXTURE_SCALE) return; // disposed meanwhile
			drawSign(ctx, title, line, glowOnly);
			tex.needsUpdate = true;
		});
	}
	return tex;
}

/**
 * A small wooden sign hanging from a nail by a cord. Front faces +z, the
 * nail sits at the group's origin so it can be pinned straight to a wall.
 */
export function createGreetingSign({
	title,
	line,
	width,
	glow = SIGN_GLOW,
	halo = 0,
}: GreetingSignOptions): Group {
	const g = new Group();
	const height = (width * CANVAS_H) / CANVAS_W;
	const depth = 0.04;

	const color = createSignTexture(title, line, false);
	const glowMap = createSignTexture(title, line, true);

	const woodEdge = new MeshStandardMaterial({
		color: new Color(SIGN_WOOD),
		roughness: 0.85,
		metalness: 0,
	});
	// The lettering gives off a faint light of its own, like a much dimmer
	// laptop screen, so it reads in the dark room.
	const face = new MeshStandardMaterial({
		map: color,
		roughness: 0.8,
		metalness: 0,
		emissive: new Color(0xffe9c8),
		emissiveMap: glowMap,
		emissiveIntensity: glow,
	});
	face.onBeforeCompile = (shader) => {
		shader.fragmentShader = shader.fragmentShader
			.replace(
				"#include <map_fragment>",
				ShaderChunk.map_fragment.replace(
					"texture2D( map, vMapUv )",
					`texture2D( map, vMapUv, ${TEXT_LOD_BIAS.toFixed(2)} )`,
				),
			)
			.replace(
				"#include <emissivemap_fragment>",
				ShaderChunk.emissivemap_fragment.replace(
					"texture2D( emissiveMap, vEmissiveMapUv )",
					`texture2D( emissiveMap, vEmissiveMapUv, ${TEXT_LOD_BIAS.toFixed(2)} )`,
				),
			);
	};

	const board = new Group();
	board.position.y = -0.22 - height / 2;
	g.add(board);

	const body = new Mesh(new BoxGeometry(width, height, depth), woodEdge);
	board.add(body);
	const front = new Mesh(new PlaneGeometry(width, height), face);
	front.position.z = depth / 2 + 0.001;
	board.add(front);

	if (halo > 0) {
		const glowLayer = new Mesh(
			new PlaneGeometry(width, height),
			new MeshBasicMaterial({
				map: createHaloTexture(title, line),
				transparent: true,
				opacity: halo,
				blending: AdditiveBlending,
				depthWrite: false,
			}),
		);
		glowLayer.position.z = depth / 2 + 0.002;
		board.add(glowLayer);
	}

	// Nail and the cord running up to it from both top corners.
	const metal = new MeshStandardMaterial({
		color: new Color(0x8a8780),
		roughness: 0.4,
		metalness: 0.8,
	});
	const nail = new Mesh(new CylinderGeometry(0.018, 0.018, 0.03, 12), metal);
	nail.rotation.x = Math.PI / 2;
	nail.position.z = 0.015;
	g.add(nail);

	const cordMat = new MeshStandardMaterial({
		color: new Color(0x6b5a44),
		roughness: 1,
		metalness: 0,
	});
	const cornerX = width * 0.36;
	const cornerY = board.position.y + height / 2;
	for (const side of [-1, 1]) {
		const dx = side * cornerX;
		const dy = cornerY;
		const len = Math.hypot(dx, dy);
		const cord = new Mesh(new CylinderGeometry(0.006, 0.006, len, 6), cordMat);
		cord.position.set(dx / 2, dy / 2, 0.01);
		cord.rotation.z = Math.atan2(-dx, dy);
		g.add(cord);
	}

	// Hangs a little crooked.
	board.rotation.z = -0.025;
	return g;
}
