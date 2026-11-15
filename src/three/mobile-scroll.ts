/**
 * Shelf navigation on phones and narrow windows.
 *
 * Modelled on GNOME's swipe tracker (libadwaita's AdwSwipeTracker, used for
 * workspace and carousel swipes):
 *
 *  - A gesture first locks onto one axis: vertical (between shelves) or
 *    sideways (between the items on a shelf).
 *  - It then follows the fingers 1:1, but only as far as the snap points
 *    next to where it began, so it "locks on" instead of flying past several
 *    shelves. A fast swipe widens that to two snap points either way.
 *  - On release it springs to a snap point picked from where it is and how
 *    fast it was flicked, starting at the gesture's own speed so the
 *    hand-off is seamless.
 *
 * Touch and trackpad drive the same gesture model; they differ only in how
 * a gesture begins and ends. Browsers don't say when fingers leave a
 * trackpad, so a trackpad gesture ends when its momentum tail has faded or
 * the events stop. Mouse wheels step one item per notch.
 */
import { clamp } from "./math-utils";

export interface MobileScrollConfig {
	/** Normalized vertical stop values, e.g. [0, 0.5, 1] */
	verticalStops: readonly number[];
	/** Per-row horizontal snap points */
	panSnapPoints: readonly (readonly number[])[];
	/** Max horizontal pan magnitude */
	panLimit: number;
	/** Number of shelf rows (matches MOBILE_SHELF_STOPS.length) */
	numRows: number;
}

export interface MobileScrollController {
	onPointerDown(e: PointerEvent): boolean;
	onPointerMove(e: PointerEvent): boolean;
	onPointerUp(e: PointerEvent): boolean;
	onPointerCancel(e: PointerEvent): boolean;
	cancelActiveGesture(): boolean;
	onWheel(e: WheelEvent): boolean;
	/** Advance animation by dt seconds. Returns true if camera position changed. */
	tick(dt: number): boolean;
	/** Current vertical track position (0–1, may exceed during rubber-band) */
	readonly verticalT: number;
	/** Current per-row horizontal pan values */
	readonly panByRow: readonly number[];
	/** Consume a pending tap event, or null if none */
	consumeTap(): { clientX: number; clientY: number } | null;
	/** Animate to a specific linear stop by index. Returns true if animation started. */
	navigateToLinearStop(idx: number): boolean;
	/** Hard-reset position (used after transitions) */
	resetTo(t: number): boolean;
	dispose(): void;
}

// ─── Tuning ──────────────────────────────────────────────────────

/** Finger or trackpad travel (px) per step: one shelf, or one item. */
const PX_PER_STEP = {
	touch: { v: 260, h: 330 },
	trackpad: { v: 400, h: 300 },
} as const;
/** Travel (px) before a gesture picks its axis, how much the main axis must
 *  outweigh the other, and the travel past which the larger axis wins. */
const LOCK_PX = 10;
const LOCK_DOMINANCE = 1.5;
const LOCK_FORCE_PX = 30;
/** Release speed (steps/s) that counts as a flick toward the next point. */
const FLICK_SPEED = { touch: 1.2, trackpad: 2.5 } as const;
/** Peak speed (steps/s) at which a gesture may travel two steps, not one. */
const LONG_SWIPE_SPEED = { touch: 6, trackpad: 8 } as const;
/** A trackpad flick moves on only if it got this share of a step. */
const TRACKPAD_FLICK_MIN_TRAVEL = 0.2;
/** Window (ms) for measuring gesture speed. */
const VELOCITY_WINDOW_MS = 100;
/** Max overscroll past the first or last point, as a share of a step. */
const EDGE_STRETCH = 0.15;
/** Settle spring: critically damped (never wobbles), ~0.3 s to rest. */
const SPRING_OMEGA = 22;

const TAP_PX = 10;

/** A trackpad gesture ends after this long without events... */
const TRACKPAD_QUIET_MS = 150;
/** ...or once its momentum tail has faded below this delta (px), having
 *  peaked above TRACKPAD_TAIL_MIN_PEAK and dropped under a quarter of it. */
const TRACKPAD_TAIL_PX = 1.5;
const TRACKPAD_TAIL_MIN_PEAK = 6;
/** After a gesture ends, the rest of its momentum is ignored unless a delta
 *  reverses direction or jumps this much (and at least _MIN px): that's a new
 *  swipe. Momentum only ever fades, in one direction. */
const TRACKPAD_NEW_SWIPE_RATIO = 2.5;
const TRACKPAD_NEW_SWIPE_MIN_PX = 3;

const WHEEL_LINE_PX = 16;
const WHEEL_STEP_PX = 40;
const WHEEL_COOLDOWN_MS = 200;
const DISCRETE_WHEEL_STEPS = new Set([100, 120]);

// ─── Tracks: one axis that springs between snap points ───────────

interface Track {
	pos: number;
	points: readonly number[];
	/** Spring target, or null when at rest or under a gesture's control. */
	target: number | null;
	velocity: number;
	/** Distance between neighbouring points, so tuning is scale-free. */
	step: number;
}

function createTrack(points: readonly number[], pos: number): Track {
	const span = points.length > 1 ? points[points.length - 1] - points[0] : 1;
	return { pos, points, target: null, velocity: 0, step: span / Math.max(1, points.length - 1) };
}

function nearestIndex(points: readonly number[], value: number): number {
	let best = 0;
	for (let i = 1; i < points.length; i++) {
		if (Math.abs(points[i] - value) < Math.abs(points[best] - value)) best = i;
	}
	return best;
}

/** The point a track is headed for: its spring target, else its position. */
function restingIndex(track: Track): number {
	return nearestIndex(track.points, track.target ?? track.pos);
}

/** Index of the first point strictly beyond `value` in `dir`, if any. */
function indexBeyond(points: readonly number[], value: number, dir: number): number | null {
	if (dir > 0) {
		const i = points.findIndex((p) => p > value + 1e-4);
		return i === -1 ? null : i;
	}
	for (let i = points.length - 1; i >= 0; i--) {
		if (points[i] < value - 1e-4) return i;
	}
	return null;
}

function prefersReducedMotion(): boolean {
	return (
		typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
	);
}

/** Spring to `target`, starting at `velocity`. Speed is capped so a
 *  critically damped spring can't overshoot the target. */
function springTo(track: Track, target: number, velocity = 0): boolean {
	const distance = Math.abs(target - track.pos);
	if (prefersReducedMotion() || (distance < 1e-4 && Math.abs(velocity) < 1e-3)) {
		track.pos = target;
		track.target = null;
		track.velocity = 0;
		return distance >= 1e-4;
	}
	const cap = SPRING_OMEGA * distance;
	track.target = target;
	track.velocity = clamp(velocity, -cap, cap);
	return true;
}

/** Advance a track's spring by `dt` seconds (exact critically damped step). */
function stepTrack(track: Track, dt: number): boolean {
	if (track.target === null) return false;
	const offset = track.pos - track.target;
	const c = track.velocity + SPRING_OMEGA * offset;
	const decay = Math.exp(-SPRING_OMEGA * dt);
	track.pos = track.target + (offset + c * dt) * decay;
	track.velocity = (c - SPRING_OMEGA * (offset + c * dt)) * decay;
	if (Math.abs(track.pos - track.target) < 2e-4 && Math.abs(track.velocity) < 5e-3) {
		track.pos = track.target;
		track.target = null;
		track.velocity = 0;
	}
	return true;
}

// ─── Gestures ────────────────────────────────────────────────────

type Source = "touch" | "trackpad";

interface Gesture {
	source: Source;
	axis: "v" | "h" | null;
	/** Sideways on a shelf with nothing to pan to: sit it out. */
	ignored: boolean;
	/** Travel (px) gathered before picking an axis. */
	lockX: number;
	lockY: number;
	track: Track | null;
	/** Snap point the gesture started from, and how far it may go. */
	baseIndex: number;
	min: number;
	max: number;
	/** Position before the edge stretch is applied. */
	raw: number;
	/** Units per px for this gesture's axis and source. */
	scale: number;
	/** Recent (time, position) samples for measuring speed. */
	samples: { t: number; pos: number }[];
	/** Fastest the gesture has moved, in steps/s. */
	peakSpeed: number;
}

function newGesture(source: Source): Gesture {
	return {
		source,
		axis: null,
		ignored: false,
		lockX: 0,
		lockY: 0,
		track: null,
		baseIndex: 0,
		min: 0,
		max: 0,
		raw: 0,
		scale: 0,
		samples: [],
		peakSpeed: 0,
	};
}

/** Speed (units/s), by least squares over the recent samples. */
function gestureVelocity(g: Gesture): number {
	const n = g.samples.length;
	if (n < 2) return 0;
	const t0 = g.samples[n - 1].t;
	let st = 0;
	let sp = 0;
	let stt = 0;
	let stp = 0;
	for (const s of g.samples) {
		const t = (s.t - t0) / 1000;
		st += t;
		sp += s.pos;
		stt += t * t;
		stp += t * s.pos;
	}
	const denom = n * stt - st * st;
	return Math.abs(denom) < 1e-10 ? 0 : (n * stp - st * sp) / denom;
}

function normalizeWheelDelta(delta: number, deltaMode: number): number {
	if (deltaMode === 1) return delta * WHEEL_LINE_PX;
	if (deltaMode === 2) return delta * (typeof window !== "undefined" ? window.innerHeight : 800);
	return delta;
}

/** Chrome/Edge mouse wheels send isolated 100/120px vertical steps;
 *  trackpads send small, irregular deltas. */
function isDiscreteWheel(e: WheelEvent): boolean {
	if (e.deltaMode !== 0) return true;
	const absY = Math.abs(e.deltaY);
	if (e.deltaX !== 0 || absY < 80 || !Number.isInteger(e.deltaY)) return false;
	return DISCRETE_WHEEL_STEPS.has(absY);
}

// ─── Controller ──────────────────────────────────────────────────

export function createMobileScrollController(
	canvas: HTMLCanvasElement,
	config: MobileScrollConfig,
): MobileScrollController {
	const { verticalStops, panSnapPoints, numRows } = config;
	const vertical = createTrack(verticalStops, verticalStops[0] ?? 0);
	const pans = Array.from({ length: numRows }, (_, row) =>
		createTrack(panSnapPoints[row]?.length ? panSnapPoints[row] : [0], 0),
	);
	const panByRow = pans.map((track) => track.pos);
	/** Every item in order, bottom shelf first, for keyboard and mouse wheel. */
	const linearStops = verticalStops.flatMap((_, row) =>
		pans[row].points.map((pan) => ({ row, pan })),
	);

	let gesture: Gesture | null = null;
	let dirty = false;

	// Touch
	let pointerId: number | null = null;
	let downX = 0;
	let downY = 0;
	let lastX = 0;
	let lastY = 0;
	let pendingTap: { clientX: number; clientY: number } | null = null;

	// Trackpad
	let lastWheelAt = Number.NEGATIVE_INFINITY;
	let lastMagnitude = 0;
	let peakMagnitude = 0;
	let wheelEndTimer = 0;
	/** The gesture ended but its momentum is still arriving. */
	let swallowing: { axis: "v" | "h"; sign: number } | null = null;

	// Mouse wheel
	let wheelAccum = 0;
	let lastWheelStepAt = Number.NEGATIVE_INFINITY;

	function syncPans(): void {
		for (let i = 0; i < numRows; i++) panByRow[i] = pans[i].pos;
	}

	// ── Shared gesture model ──

	/** Feed movement in px, in wheel-delta terms: positive moves the view
	 *  down or left. A finger dragging down reports the same sign. */
	function feed(g: Gesture, dx: number, dy: number, now: number): boolean {
		if (g.ignored) return false;
		if (!g.axis) {
			g.lockX += dx;
			g.lockY += dy;
			const ax = Math.abs(g.lockX);
			const ay = Math.abs(g.lockY);
			const travel = Math.hypot(ax, ay);
			if (travel < LOCK_PX) return false;
			if (Math.max(ax, ay) < Math.min(ax, ay) * LOCK_DOMINANCE && travel < LOCK_FORCE_PX) {
				return false;
			}
			if (!lockAxis(g, ax > ay ? "h" : "v", now)) return false;
			// The travel that went into deciding counts.
			dx = g.lockX;
			dy = g.lockY;
		}
		const track = g.track;
		if (!track) return false;

		g.raw -= (g.axis === "v" ? dy : dx) * g.scale;
		const first = track.points[0];
		const last = track.points[track.points.length - 1];
		// Hard stops at the gesture's range. Only pushing at an end the view
		// is already on stretches a little past it ("nothing more this way");
		// arriving at an end stops dead, so momentum can't overshoot it.
		const atStart = g.baseIndex === 0;
		const atEnd = g.baseIndex === track.points.length - 1;
		g.raw = clamp(
			g.raw,
			atStart ? Number.NEGATIVE_INFINITY : g.min,
			atEnd ? Number.POSITIVE_INFINITY : g.max,
		);
		const stretch = EDGE_STRETCH * track.step;
		const ease = (over: number) => stretch * (1 - Math.exp(-over / stretch));
		const pos =
			g.raw < first
				? first - ease(first - g.raw)
				: g.raw > last
					? last + ease(g.raw - last)
					: g.raw;

		g.samples.push({ t: now, pos: g.raw });
		while (g.samples.length > 2 && g.samples[0].t < now - VELOCITY_WINDOW_MS) g.samples.shift();
		const speed = Math.abs(gestureVelocity(g)) / track.step;
		g.peakSpeed = Math.max(g.peakSpeed, speed);
		if (speed > LONG_SWIPE_SPEED[g.source]) setRange(g, 2);

		const moved = Math.abs(pos - track.pos) > 1e-5;
		track.pos = pos;
		return moved;
	}

	function lockAxis(g: Gesture, axis: "v" | "h", now: number): boolean {
		// Sideways moves the shelf in view, or the one the view is heading to.
		const track = axis === "v" ? vertical : pans[restingIndex(vertical)];
		if (axis === "h" && track.points.length < 2) {
			g.ignored = true;
			return false;
		}
		g.axis = axis;
		g.track = track;
		g.scale = track.step / PX_PER_STEP[g.source][axis];
		// Mid-glide, the gesture counts from where the glide was heading, so
		// quick repeated swipes each move one more step.
		g.baseIndex = restingIndex(track);
		setRange(g, 1);
		track.target = null;
		track.velocity = 0;
		g.raw = track.pos;
		g.samples = [{ t: now, pos: g.raw }];
		return true;
	}

	function setRange(g: Gesture, steps: number): void {
		const points = g.track?.points ?? [0];
		g.min = points[Math.max(0, g.baseIndex - steps)];
		g.max = points[Math.min(points.length - 1, g.baseIndex + steps)];
	}

	/** Spring the gesture's track to a snap point: the nearest one, or the
	 *  next one along if the gesture was flicked. A touch flick is judged by
	 *  release speed; a trackpad's "release" is the end of its momentum, so
	 *  it's judged by peak speed and how far it got. */
	function release(g: Gesture): boolean {
		const track = g.track;
		if (!track || !g.axis) return false;
		const velocity = gestureVelocity(g);
		const nearest = nearestIndex(track.points, track.pos);
		let index = nearest;
		if (g.source === "touch") {
			if (Math.abs(velocity) / track.step > FLICK_SPEED.touch) {
				index = indexBeyond(track.points, track.pos, Math.sign(velocity)) ?? nearest;
			}
		} else {
			const travel = (track.pos - track.points[g.baseIndex]) / track.step;
			if (
				nearest === g.baseIndex &&
				g.peakSpeed > FLICK_SPEED.trackpad &&
				Math.abs(travel) >= TRACKPAD_FLICK_MIN_TRAVEL
			) {
				index = indexBeyond(track.points, track.pos, Math.sign(travel)) ?? nearest;
			}
		}
		return springTo(track, clamp(track.points[index], g.min, g.max), velocity);
	}

	function endGesture(): boolean {
		const g = gesture;
		gesture = null;
		return g ? release(g) : false;
	}

	// ── Touch ──

	function onPointerDown(e: PointerEvent): boolean {
		if (e.button !== 0 || pointerId !== null) return false;
		cancelWheel();
		pointerId = e.pointerId;
		downX = lastX = e.clientX;
		downY = lastY = e.clientY;
		pendingTap = null;
		gesture = newGesture("touch");
		canvas.setPointerCapture?.(e.pointerId);
		return false;
	}

	function onPointerMove(e: PointerEvent): boolean {
		if (e.pointerId !== pointerId || !gesture) return false;
		const dx = e.clientX - lastX;
		const dy = e.clientY - lastY;
		lastX = e.clientX;
		lastY = e.clientY;
		return feed(gesture, dx, dy, performance.now()) ? markChanged() : false;
	}

	function onPointerUp(e: PointerEvent): boolean {
		if (e.pointerId !== pointerId) return false;
		releasePointer(e.pointerId);
		if (gesture && !gesture.axis && Math.hypot(e.clientX - downX, e.clientY - downY) <= TAP_PX) {
			gesture = null;
			pendingTap = { clientX: e.clientX, clientY: e.clientY };
			return true;
		}
		return endGesture() ? markChanged() : false;
	}

	function onPointerCancel(e: PointerEvent): boolean {
		if (e.pointerId !== pointerId) return false;
		releasePointer(e.pointerId);
		pendingTap = null;
		return endGesture() ? markChanged() : false;
	}

	function releasePointer(id: number): void {
		pointerId = null;
		if (canvas.hasPointerCapture?.(id)) canvas.releasePointerCapture(id);
	}

	// ── Trackpad ──

	function onTrackpad(dx: number, dy: number, now: number): boolean {
		const quiet = now - lastWheelAt > TRACKPAD_QUIET_MS;
		lastWheelAt = now;
		const magnitude = Math.hypot(dx, dy);
		const previous = lastMagnitude;
		lastMagnitude = magnitude;
		armWheelEnd();

		if (swallowing && !quiet) {
			const along = swallowing.axis === "v" ? dy : dx;
			const reversed = Math.abs(along) >= 1 && Math.sign(along) === -swallowing.sign;
			const jumped =
				magnitude >= TRACKPAD_NEW_SWIPE_MIN_PX && magnitude > previous * TRACKPAD_NEW_SWIPE_RATIO;
			if (!reversed && !jumped) return false;
		}
		swallowing = null;

		let changed = false;
		if (!gesture || quiet) {
			changed = endGesture();
			gesture = newGesture("trackpad");
			peakMagnitude = 0;
		}
		const g = gesture;
		peakMagnitude = Math.max(peakMagnitude, magnitude);
		changed = feed(g, dx, dy, now) || changed;

		// The momentum has all but faded: settle now, not after the last few
		// barely-moving events.
		if (
			g.axis &&
			peakMagnitude >= TRACKPAD_TAIL_MIN_PEAK &&
			magnitude < TRACKPAD_TAIL_PX &&
			magnitude < peakMagnitude / 4
		) {
			swallowing = { axis: g.axis, sign: Math.sign(g.axis === "v" ? dy : dx) || 1 };
			changed = endGesture() || changed;
		}
		return changed;
	}

	function armWheelEnd(): void {
		if (wheelEndTimer) clearTimeout(wheelEndTimer);
		wheelEndTimer = window.setTimeout(() => {
			wheelEndTimer = 0;
			swallowing = null;
			if (gesture?.source === "trackpad" && endGesture()) dirty = true;
		}, TRACKPAD_QUIET_MS);
	}

	function cancelWheel(): boolean {
		if (wheelEndTimer) clearTimeout(wheelEndTimer);
		wheelEndTimer = 0;
		swallowing = null;
		wheelAccum = 0;
		return gesture?.source === "trackpad" ? endGesture() : false;
	}

	// ── Mouse wheel: one item per notch ──

	function onWheelStep(dy: number, now: number): boolean {
		wheelAccum += dy;
		if (Math.abs(wheelAccum) < WHEEL_STEP_PX || now - lastWheelStepAt < WHEEL_COOLDOWN_MS) {
			return false;
		}
		// Same direction as a trackpad: scrolling down moves the view down.
		const dir = wheelAccum > 0 ? -1 : 1;
		wheelAccum = 0;
		lastWheelStepAt = now;
		const row = restingIndex(vertical);
		const pan = pans[row].points[restingIndex(pans[row])];
		const current = linearStops.findIndex((s) => s.row === row && s.pan === pan);
		return navigateTo(current + dir);
	}

	function onWheel(e: WheelEvent): boolean {
		e.preventDefault();
		if (pointerId !== null) return false;
		const now = performance.now();
		const dx = normalizeWheelDelta(e.deltaX, e.deltaMode);
		const dy = normalizeWheelDelta(e.deltaY, e.deltaMode);
		const changed = isDiscreteWheel(e) ? onWheelStep(dy, now) : onTrackpad(dx, dy, now);
		return changed ? markChanged() : false;
	}

	// ── Programmatic ──

	function navigateTo(idx: number): boolean {
		const stop = linearStops[idx];
		if (!stop) return false;
		gesture = null;
		let changed = springTo(vertical, verticalStops[stop.row]);
		changed = springTo(pans[stop.row], stop.pan) || changed;
		return changed;
	}

	function markChanged(): true {
		dirty = true;
		syncPans();
		return true;
	}

	function tick(dt: number): boolean {
		let changed = dirty;
		dirty = false;
		changed = stepTrack(vertical, dt) || changed;
		for (const track of pans) changed = stepTrack(track, dt) || changed;
		if (changed) syncPans();
		return changed;
	}

	function cancelActiveGesture(): boolean {
		if (pointerId !== null) releasePointer(pointerId);
		pendingTap = null;
		const changed = cancelWheel() || endGesture();
		return changed ? markChanged() : false;
	}

	function resetTo(t: number): boolean {
		const next = clamp(t, 0, 1);
		const changed = Math.abs(vertical.pos - next) > 1e-4 || pans.some((p) => p.pos !== 0);
		cancelActiveGesture();
		for (const track of [vertical, ...pans]) {
			track.target = null;
			track.velocity = 0;
			track.pos = 0;
		}
		vertical.pos = next;
		dirty = false;
		syncPans();
		return changed;
	}

	function dispose(): void {
		cancelActiveGesture();
		dirty = false;
	}

	return {
		onPointerDown,
		onPointerMove,
		onPointerUp,
		onPointerCancel,
		cancelActiveGesture,
		onWheel,
		tick,
		get verticalT() {
			return vertical.pos;
		},
		panByRow,
		consumeTap() {
			const tap = pendingTap;
			pendingTap = null;
			return tap;
		},
		navigateToLinearStop(idx: number): boolean {
			return navigateTo(clamp(idx, 0, linearStops.length - 1)) ? markChanged() : false;
		},
		resetTo,
		dispose,
	};
}
