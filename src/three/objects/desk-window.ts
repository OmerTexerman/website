import {
	BoxGeometry,
	CanvasTexture,
	Color,
	Group,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	PlaneGeometry,
	SRGBColorSpace,
} from "three";

/**
 * A window on the wall behind the desk, looking out on Boston's sky as it is
 * right now: blue by day, orange and pink around sunrise and sunset, deep
 * blue with stars at night. A flat sun crosses the sky through the day and a
 * moon through the night, over a blocky skyline. Clicking it plays a quick
 * 24-hour time-lapse, then settles back to now.
 */

// Boston: longitude 71.06°W puts solar noon at ~16:44 UTC. Day length swings
// about ±3 h around 12 h over the year at its latitude (42.4°N).
const SOLAR_NOON_UTC = 12 + 71.06 / 15;
const DAY_LENGTH_SWING_H = 3.05;

const CANVAS_W = 256;
const CANVAS_H = 288;
const SKYLINE_TOP = 0.78; // share of the height where the skyline begins

const OPENING_W = 1.8;
const OPENING_H = OPENING_W * (CANVAS_H / CANVAS_W);
const FRAME = 0.08;
const DEPTH = 0.08;

const TIMELAPSE_MS = 3200;

interface SkyState {
	/** Signed sun elevation proxy: 1 at noon, 0 at the horizon, -1 at midnight. */
	elevation: number;
	/** 0 → 1 across the day while the sun is up, otherwise null. */
	dayProgress: number | null;
	/** 0 → 1 across the night while the sun is down, otherwise null. */
	nightProgress: number | null;
}

function dayOfYear(date: Date): number {
	const start = Date.UTC(date.getUTCFullYear(), 0, 0);
	return Math.floor((date.getTime() - start) / 86_400_000);
}

export function bostonSky(date: Date): SkyState {
	const dayLength =
		12 + DAY_LENGTH_SWING_H * Math.sin((2 * Math.PI * (dayOfYear(date) - 80)) / 365);
	const hours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
	// Hours from solar noon, wrapped into [-12, 12).
	const fromNoon = ((((hours - SOLAR_NOON_UTC) % 24) + 36) % 24) - 12;
	const half = dayLength / 2;
	if (Math.abs(fromNoon) < half) {
		const dayProgress = (fromNoon + half) / dayLength;
		return { elevation: Math.sin(Math.PI * dayProgress), dayProgress, nightProgress: null };
	}
	const sinceSunset = (((fromNoon - half) % 24) + 24) % 24;
	const nightProgress = sinceSunset / (24 - dayLength);
	return { elevation: -Math.sin(Math.PI * nightProgress), dayProgress: null, nightProgress };
}

const smoothstep = (a: number, b: number, x: number): number => {
	const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
	return t * t * (3 - 2 * t);
};

const NIGHT = { top: new Color("#0a0f24"), bottom: new Color("#1d2550") };
const DAY = { top: new Color("#5b97cf"), bottom: new Color("#a9cfe8") };
const DUSK = { top: new Color("#3d3a6e"), bottom: new Color("#ee8a5e") };

// Fixed, so the stars and lit windows don't jump around between redraws.
const STARS = Array.from({ length: 34 }, (_, i) => ({
	x: ((i * 73) % 97) / 97,
	y: (((i * 41) % 89) / 89) * SKYLINE_TOP * 0.9,
	size: i % 5 === 0 ? 2 : 1,
}));
const BUILDINGS = [
	{ x: 0, w: 0.14, h: 0.12 },
	{ x: 0.13, w: 0.1, h: 0.2 },
	{ x: 0.22, w: 0.12, h: 0.14 },
	{ x: 0.33, w: 0.08, h: 0.3 }, // the tall one
	{ x: 0.4, w: 0.14, h: 0.17 },
	{ x: 0.53, w: 0.1, h: 0.23 },
	{ x: 0.62, w: 0.15, h: 0.13 },
	{ x: 0.76, w: 0.09, h: 0.21 },
	{ x: 0.84, w: 0.16, h: 0.15 },
];

function hex(c: Color): string {
	return `#${c.getHexString()}`;
}

function drawSky(ctx: CanvasRenderingContext2D, sky: SkyState): void {
	const W = CANVAS_W;
	const H = CANVAS_H;
	const horizon = H * SKYLINE_TOP;
	const light = smoothstep(-0.15, 0.3, sky.elevation);
	const dusk = 1 - smoothstep(0, 0.35, Math.abs(sky.elevation));

	const top = NIGHT.top
		.clone()
		.lerp(DAY.top, light)
		.lerp(DUSK.top, dusk * 0.7);
	const bottom = NIGHT.bottom
		.clone()
		.lerp(DAY.bottom, light)
		.lerp(DUSK.bottom, dusk * 0.85);
	const gradient = ctx.createLinearGradient(0, 0, 0, horizon);
	gradient.addColorStop(0, hex(top));
	gradient.addColorStop(1, hex(bottom));
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, W, H);

	// Stars fade in as the light goes.
	const starAlpha = 1 - smoothstep(-0.25, 0, sky.elevation);
	if (starAlpha > 0) {
		ctx.fillStyle = `rgba(255, 248, 225, ${starAlpha.toFixed(3)})`;
		for (const star of STARS) {
			ctx.fillRect(Math.round(star.x * W), Math.round(star.y * H), star.size, star.size);
		}
	}

	// Sun or moon on an arc from the left horizon, over the top, to the right.
	const progress = sky.dayProgress ?? sky.nightProgress ?? 0;
	const x = W * (0.08 + 0.84 * progress);
	const y = horizon - Math.sin(Math.PI * progress) * horizon * 0.72;
	ctx.beginPath();
	if (sky.dayProgress !== null) {
		const sunColor = new Color("#ffe39a").lerp(new Color("#ff9a55"), dusk);
		ctx.fillStyle = hex(sunColor);
		ctx.arc(x, y, 15, 0, Math.PI * 2);
		ctx.fill();
	} else {
		ctx.fillStyle = "#f3eedc";
		ctx.arc(x, y, 12, 0, Math.PI * 2);
		ctx.fill();
		// Bite out of it for a crescent.
		ctx.beginPath();
		ctx.fillStyle = hex(top.clone().lerp(bottom, y / horizon));
		ctx.arc(x + 6, y - 4, 10, 0, Math.PI * 2);
		ctx.fill();
	}

	// Skyline: flat blocks, a shade darker than the sky, with a few lit
	// windows once it gets dark.
	const skylineColor = new Color("#141826").lerp(new Color("#3b4a66"), light * 0.6);
	ctx.fillStyle = hex(skylineColor);
	for (const b of BUILDINGS) {
		ctx.fillRect(
			Math.round(b.x * W),
			Math.round(H - b.h * H - (H - horizon) * 0.4),
			Math.ceil(b.w * W),
			H,
		);
	}
	ctx.fillRect(0, horizon + (H - horizon) * 0.6, W, H);
	const windowAlpha = 1 - smoothstep(-0.1, 0.15, sky.elevation);
	if (windowAlpha > 0) {
		ctx.fillStyle = `rgba(255, 210, 120, ${(0.85 * windowAlpha).toFixed(3)})`;
		BUILDINGS.forEach((b, i) => {
			const bx = b.x * W;
			const by = H - b.h * H - (H - horizon) * 0.4;
			for (let row = 0; row < 4; row++) {
				for (let col = 0; col < 3; col++) {
					if ((i * 7 + row * 3 + col * 5) % 4 !== 0) continue;
					ctx.fillRect(Math.round(bx + 4 + col * 7), Math.round(by + 5 + row * 8), 3, 3);
				}
			}
		});
	}
}

export interface DeskWindowObject {
	root: Group;
	/** Hover label height relative to the window's centre: just under the
	 *  sill, since the window sits near the top of the view. */
	labelOffsetY: number;
	/** Hover text, kept current: "Boston · 7:35 pm". */
	label: () => string;
	playTimelapse: () => void;
	dispose: () => void;
}

/** `requestRender` is called whenever the sky has been redrawn. */
export function createDeskWindow(requestRender: () => void): DeskWindowObject {
	const root = new Group();

	const canvas = document.createElement("canvas");
	canvas.width = CANVAS_W;
	canvas.height = CANVAS_H;
	const ctx = canvas.getContext("2d");
	const texture = new CanvasTexture(canvas);
	texture.colorSpace = SRGBColorSpace;

	// Unlit: the view outside isn't lit by the room's lamps.
	const sky = new Mesh(
		new PlaneGeometry(OPENING_W, OPENING_H),
		new MeshBasicMaterial({ map: texture }),
	);
	root.add(sky);

	const wood = new MeshStandardMaterial({
		color: new Color("#3b2414"),
		roughness: 0.85,
		metalness: 0,
	});
	const frameW = OPENING_W + FRAME * 2;
	const frameH = OPENING_H + FRAME * 2;
	const bar = (w: number, h: number, x: number, y: number, d = DEPTH) => {
		const mesh = new Mesh(new BoxGeometry(w, h, d), wood);
		mesh.position.set(x, y, d / 2);
		mesh.castShadow = true;
		root.add(mesh);
	};
	bar(frameW, FRAME, 0, OPENING_H / 2 + FRAME / 2);
	bar(frameW, FRAME, 0, -OPENING_H / 2 - FRAME / 2);
	bar(FRAME, frameH, -OPENING_W / 2 - FRAME / 2, 0);
	bar(FRAME, frameH, OPENING_W / 2 + FRAME / 2, 0);
	// Cross mullions.
	bar(0.04, OPENING_H, 0, 0, DEPTH * 0.6);
	bar(OPENING_W, 0.04, 0, OPENING_H * 0.08, DEPTH * 0.6);
	// Sill.
	bar(frameW + 0.12, 0.06, 0, -OPENING_H / 2 - FRAME - 0.03, DEPTH * 2.2);

	let timelapseStart = 0;
	let frame = 0;

	function redraw(at: Date, notify = true): void {
		if (!ctx) return;
		drawSky(ctx, bostonSky(at));
		texture.needsUpdate = true;
		if (notify) requestRender();
	}

	function tickTimelapse(now: number): void {
		const t = Math.min((now - timelapseStart) / TIMELAPSE_MS, 1);
		// Gets going almost at once and eases out at the end, settling on "now".
		const eased = 1 - (1 - t) ** 2.5;
		redraw(new Date(Date.now() + eased * 86_400_000));
		frame = t < 1 ? requestAnimationFrame(tickTimelapse) : 0;
	}

	function playTimelapse(): void {
		if (frame) return;
		timelapseStart = performance.now();
		frame = requestAnimationFrame(tickTimelapse);
	}

	// The first draw happens while the scene is still being built and renders
	// with it, so there is nothing to notify yet.
	redraw(new Date(), false);
	const interval = window.setInterval(() => {
		if (!frame) redraw(new Date());
	}, 60_000);

	return {
		root,
		labelOffsetY: -(OPENING_H / 2 + FRAME + 0.5),
		label: () =>
			`Boston · ${new Date()
				.toLocaleTimeString("en-US", {
					timeZone: "America/New_York",
					hour: "numeric",
					minute: "2-digit",
				})
				.toLowerCase()}`,
		playTimelapse,
		dispose: () => {
			window.clearInterval(interval);
			if (frame) cancelAnimationFrame(frame);
			frame = 0;
		},
	};
}
