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

interface LinearStop {
	stopIndex: number;
	panTarget: number;
	row: number;
}

function buildLinearSequence(config: MobileScrollConfig): LinearStop[] {
	const { verticalStops, panSnapPoints } = config;
	const sequence: LinearStop[] = [];
	for (let i = 0; i < verticalStops.length; i++) {
		const points = panSnapPoints[i];
		if (!points || points.length <= 1) {
			sequence.push({
				stopIndex: i,
				panTarget: points?.[0] ?? 0,
				row: i,
			});
		} else {
			for (const p of points) {
				sequence.push({ stopIndex: i, panTarget: p, row: i });
			}
		}
	}
	return sequence;
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

enum State {
	IDLE = 0,
	TRACKING = 1,
	DRAGGING = 2,
	ANIMATING = 3,
}

const TAP_DISTANCE_THRESHOLD = 10;
const DIRECTION_LOCK_THRESHOLD = 8;
const FLICK_VELOCITY_THRESHOLD = 200;
const POSITION_COMMIT_RATIO = 0.35;
/** Stiffness of the settle spring (critically damped, so it never wobbles):
 *  ~0.35 s to come to rest from a standstill. It starts at the speed the
 *  finger or trackpad was moving, so letting go never jolts the shelf. */
const SPRING_OMEGA = 18;
/** Cap on the speed handed to the spring, in stops per second, so a hard
 *  flick doesn't overshoot past the stop it lands on. */
const SPRING_MAX_STOPS_PER_S = 4;
const RUBBER_BAND_FACTOR = 0.35;
const VELOCITY_WINDOW_MS = 100;
const WHEEL_LINE_PIXELS = 16;
const WHEEL_PAGE_THRESHOLD = 40;
const WHEEL_COOLDOWN_MS = 200;
const WHEEL_SETTLE_DELAY_MS = 100;
// Trackpads: the shelf follows the fingers 1:1, and the moment they lift
// (macOS starts sending its "momentum" tail of steadily shrinking deltas) it
// snaps to the next row or item in the direction of travel and ignores the
// rest of the tail. Riding the momentum and snapping only once it died out
// felt laggy: the shelf drifted, then locked in late.
/** Quiet time (ms) that separates one gesture from the next. */
const TRACKPAD_GESTURE_GAP_MS = 180;
/** Travel (px) before a gesture picks its axis from the accumulated motion. */
const TRACKPAD_AXIS_LOCK_PX = 6;
/** Trackpad travel (px) that moves the shelf one row. */
const TRACKPAD_ROW_PX = 400;
/** Horizontal travel per px (pan units). */
const TRACKPAD_PAN_SPEED = 0.0033;
/** A gesture that ends this share of the way to the next stop goes there,
 *  rather than springing back, so short deliberate swipes still count. */
const TRACKPAD_COMMIT = 0.25;
/** Once momentum starts, any travel at all in a direction commits to it. */
const TRACKPAD_FLICK_COMMIT = 0.05;
/** Consecutive shrinking deltas that mark the fingers as lifted. */
const TRACKPAD_MOMENTUM_EVENTS = 5;
/** ...and they must have fallen to this share of the gesture's peak delta:
 *  fingers dragging slowly also produce a few shrinking deltas in a row,
 *  which used to snap the shelf mid-swipe. */
const TRACKPAD_MOMENTUM_PEAK_RATIO = 0.6;
/** Smoothing for the trackpad's measured speed (share of each new sample). */
const TRACKPAD_VELOCITY_SMOOTHING = 0.4;
/** Each momentum delta is at most this share of the previous one. */
const TRACKPAD_MOMENTUM_DECAY = 0.97;
/** During an ignored momentum tail, a delta this many times the previous
 *  one (and at least TRACKPAD_NEW_SWIPE_MIN_PX) is a fresh swipe. */
const TRACKPAD_NEW_SWIPE_RATIO = 2.5;
const TRACKPAD_NEW_SWIPE_MIN_PX = 15;
/** Max overshoot (pan units) when swiping past the end of a row. */
const TRACKPAD_PAN_EDGE = 0.08;
/** Finger travel (px) that moves the shelf one row. Set per row, not per
 *  0–1 range, so adding stops doesn't make the drag more sensitive. */
const DRAG_ROW_PX = 260;
const DRAG_PAN_SPEED = 0.003;
const DISCRETE_PIXEL_WHEEL_STEPS = new Set([100, 120]);

interface PointerSample {
	x: number;
	y: number;
	t: number;
}

interface TapPoint {
	clientX: number;
	clientY: number;
}

function prefersReducedMotion(): boolean {
	return (
		typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
	);
}

function rubberBand(overscroll: number, limit: number): number {
	const sign = Math.sign(overscroll);
	const abs = Math.abs(overscroll);
	return sign * RUBBER_BAND_FACTOR * limit * (1 - Math.exp(-abs / (limit * 0.5)));
}

function estimateVelocity(samples: PointerSample[]): { vx: number; vy: number } {
	if (samples.length < 2) return { vx: 0, vy: 0 };

	const last = samples[samples.length - 1];
	const cutoff = last.t - VELOCITY_WINDOW_MS;

	let sumT = 0;
	let sumX = 0;
	let sumY = 0;
	let sumTT = 0;
	let sumTX = 0;
	let sumTY = 0;
	let n = 0;

	for (let i = samples.length - 1; i >= 0; i--) {
		const s = samples[i];
		if (s.t < cutoff) break;
		const t = (s.t - last.t) / 1000;
		sumT += t;
		sumX += s.x;
		sumY += s.y;
		sumTT += t * t;
		sumTX += t * s.x;
		sumTY += t * s.y;
		n++;
	}

	if (n < 2) return { vx: 0, vy: 0 };
	const denom = n * sumTT - sumT * sumT;
	if (Math.abs(denom) < 1e-10) return { vx: 0, vy: 0 };

	return {
		vx: (n * sumTX - sumT * sumX) / denom,
		vy: (n * sumTY - sumT * sumY) / denom,
	};
}

function nearestSnapPoint(value: number, points: readonly number[]): number {
	let best = points[0] ?? 0;
	let bestDist = Math.abs(value - best);
	for (let i = 1; i < points.length; i++) {
		const d = Math.abs(value - points[i]);
		if (d < bestDist) {
			best = points[i];
			bestDist = d;
		}
	}
	return best;
}

/** Advance a critically damped spring toward `target` by `dt` seconds. */
function springStep(x: number, v: number, target: number, dt: number): { x: number; v: number } {
	const c1 = x - target;
	const c2 = v + SPRING_OMEGA * c1;
	const decay = Math.exp(-SPRING_OMEGA * dt);
	return {
		x: target + (c1 + c2 * dt) * decay,
		v: (c2 - SPRING_OMEGA * (c1 + c2 * dt)) * decay,
	};
}

function springAtRest(x: number, v: number, target: number): boolean {
	return Math.abs(x - target) < 0.0002 && Math.abs(v) < 0.005;
}

function normalizeWheelDelta(delta: number, deltaMode: number): number {
	if (deltaMode === 1) return delta * WHEEL_LINE_PIXELS;
	if (deltaMode === 2) {
		return delta * (typeof window !== "undefined" ? window.innerHeight : 800);
	}
	return delta;
}

function isLikelyDiscretePixelWheelEvent(e: WheelEvent): boolean {
	if (e.deltaMode !== 0) return true;

	const absX = Math.abs(e.deltaX);
	const absY = Math.abs(e.deltaY);
	if (absX > 0 || absY < 80) return false;
	if (!Number.isInteger(e.deltaX) || !Number.isInteger(e.deltaY)) return false;

	return DISCRETE_PIXEL_WHEEL_STEPS.has(absY);
}

export function createMobileScrollController(
	canvas: HTMLCanvasElement,
	config: MobileScrollConfig,
): MobileScrollController {
	const { verticalStops, panSnapPoints, panLimit, numRows } = config;
	const rowGap = 1 / Math.max(1, verticalStops.length - 1);
	const dragVerticalSpeed = rowGap / DRAG_ROW_PX;
	const trackpadVerticalSpeed = rowGap / TRACKPAD_ROW_PX;
	const linearSequence = buildLinearSequence(config);
	let linearIndex = Math.floor(linearSequence.length / 2);

	let state: State = State.IDLE;
	let verticalT = 0.5;
	let dragOriginStop = 1;
	let animTargetT = 0;
	let animVelocity = 0;

	const panByRow: number[] = Array.from({ length: numRows }, () => 0);
	const panOriginSnap: number[] = Array.from({ length: numRows }, () => 0);
	const panAnimating: boolean[] = Array.from({ length: numRows }, () => false);
	const panAnimTarget: number[] = Array.from({ length: numRows }, () => 0);
	const panVelocity: number[] = Array.from({ length: numRows }, () => 0);

	let activePointerId: number | null = null;
	let pointerDownX = 0;
	let pointerDownY = 0;
	let pointerLastX = 0;
	let pointerLastY = 0;
	let directionLocked: "v" | "h" | null = null;
	const pointerSamples: PointerSample[] = [];
	let pendingTap: TapPoint | null = null;
	let inputDirty = false;

	let wheelAccumY = 0;
	let lastWheelPageTimeY = 0;
	let wheelAxisLock: "v" | "h" | null = null;
	let wheelSettleTimer = 0;
	// Trackpad gesture state (see TRACKPAD_* above)
	let trackpadLockX = 0;
	let trackpadLockY = 0;
	/** Sideways swipe on a row with nothing to pan to: sit the gesture out. */
	let trackpadIgnored = false;
	let trackpadActive = false;
	let trackpadLastEventAt = 0;
	/** Row a sideways gesture pans, fixed for the gesture. */
	let trackpadRow = 0;
	/** Positions before rubber-banding, so overscroll eases in and back. */
	let trackpadRawV = 0;
	let trackpadRawPan = 0;
	/** Fingers lifted and the gesture already snapped: swallow the momentum. */
	let trackpadSettled = false;
	let trackpadLastMagnitude = 0;
	let trackpadPeakMagnitude = 0;
	let trackpadDecayCount = 0;
	/** Measured speed of the current trackpad gesture (units per second). */
	let trackpadVelocity = 0;

	function markChanged(): true {
		inputDirty = true;
		return true;
	}

	function nearestStopIndex(t: number): number {
		const clamped = clamp(t, 0, 1);
		let bestIdx = 0;
		let bestDist = Math.abs(clamped - verticalStops[0]);
		for (let i = 1; i < verticalStops.length; i++) {
			const d = Math.abs(clamped - verticalStops[i]);
			if (d < bestDist) {
				bestIdx = i;
				bestDist = d;
			}
		}
		return bestIdx;
	}

	function adjacentStopIndex(fromIndex: number, direction: -1 | 1): number {
		return clamp(fromIndex + direction, 0, verticalStops.length - 1);
	}

	function chooseVerticalTarget(
		velocityPx: number,
		flickThreshold = FLICK_VELOCITY_THRESHOLD,
	): number {
		const clamped = clamp(verticalT, 0, 1);
		if (Math.abs(velocityPx) > flickThreshold) {
			const dir: -1 | 1 = velocityPx > 0 ? -1 : 1;
			return adjacentStopIndex(dragOriginStop, dir);
		}

		const originT = verticalStops[dragOriginStop];
		const displacement = clamped - originT;

		if (displacement > 0 && dragOriginStop < verticalStops.length - 1) {
			const nextT = verticalStops[dragOriginStop + 1];
			const gap = nextT - originT;
			if (displacement / gap > POSITION_COMMIT_RATIO) {
				return dragOriginStop + 1;
			}
		} else if (displacement < 0 && dragOriginStop > 0) {
			const prevT = verticalStops[dragOriginStop - 1];
			const gap = originT - prevT;
			if (Math.abs(displacement) / gap > POSITION_COMMIT_RATIO) {
				return dragOriginStop - 1;
			}
		}

		return dragOriginStop;
	}

	function choosePanTarget(row: number, velocityPx: number): number | null {
		const points = panSnapPoints[row];
		if (!points || points.length === 0) return null;

		const originSnap = panOriginSnap[row];
		const current = panByRow[row];

		if (Math.abs(velocityPx) > FLICK_VELOCITY_THRESHOLD) {
			const dir = velocityPx > 0 ? 1 : -1;
			let bestIdx = -1;
			let bestDist = Number.POSITIVE_INFINITY;
			for (let i = 0; i < points.length; i++) {
				const diff = points[i] - originSnap;
				if (dir < 0 && diff < -0.01 && Math.abs(diff) < bestDist) {
					bestIdx = i;
					bestDist = Math.abs(diff);
				} else if (dir > 0 && diff > 0.01 && Math.abs(diff) < bestDist) {
					bestIdx = i;
					bestDist = Math.abs(diff);
				}
			}
			return bestIdx >= 0 ? points[bestIdx] : nearestSnapPoint(current, points);
		}

		return nearestSnapPoint(current, points);
	}

	/** Glide to a stop on a spring that starts at `velocity` (units/s), the
	 *  speed the shelf was already moving, so the hand-off is seamless. */
	function beginVerticalAnimation(targetIndex: number, velocity = 0): boolean {
		const target = verticalStops[targetIndex];
		if (state === State.ANIMATING && Math.abs(animTargetT - target) < 0.0001) return false;
		if (state === State.IDLE && Math.abs(verticalT - target) < 0.0001 && velocity === 0) {
			return false;
		}

		const maxSpeed = rowGap * SPRING_MAX_STOPS_PER_S;
		animTargetT = target;
		animVelocity = clamp(velocity, -maxSpeed, maxSpeed);
		state = State.ANIMATING;
		return true;
	}

	function beginPanAnimation(row: number, target: number, velocity = 0): boolean {
		if (Math.abs(panByRow[row] - target) < 0.0001 && velocity === 0) {
			panAnimating[row] = false;
			panByRow[row] = target;
			return false;
		}
		panAnimating[row] = true;
		panAnimTarget[row] = target;
		panVelocity[row] = clamp(velocity, -SPRING_MAX_STOPS_PER_S, SPRING_MAX_STOPS_PER_S);
		return true;
	}

	function setVerticalWithRubberBand(raw: number): boolean {
		const previous = verticalT;
		if (raw < 0) {
			verticalT = rubberBand(raw, 1);
		} else if (raw > 1) {
			verticalT = 1 + rubberBand(raw - 1, 1);
		} else {
			verticalT = raw;
		}
		return Math.abs(verticalT - previous) > 0.0001;
	}

	function getRawVertical(): number {
		if (verticalT >= 0 && verticalT <= 1) return verticalT;
		if (verticalT < 0) {
			const ratio = verticalT / -RUBBER_BAND_FACTOR;
			if (ratio >= 1) return -2;
			return 0.5 * Math.log(1 - ratio);
		}
		const over = verticalT - 1;
		const ratio = over / RUBBER_BAND_FACTOR;
		if (ratio >= 1) return 3;
		return 1 - 0.5 * Math.log(1 - ratio);
	}

	function applyPanDelta(panDelta: number): boolean {
		const clamped = clamp(verticalT, 0, 1);
		const scaled = clamped * (numRows - 1);
		const index = Math.floor(scaled);
		const nextIndex = Math.min(index + 1, numRows - 1);
		let changed = false;

		const updateRow = (row: number, delta: number): void => {
			const next = clamp(panByRow[row] + delta, -panLimit, panLimit);
			if (Math.abs(next - panByRow[row]) > 0.0001) {
				panByRow[row] = next;
				changed = true;
			}
		};

		if (index === nextIndex) {
			updateRow(index, panDelta);
			return changed;
		}

		const secondaryWeight = scaled - index;
		const primaryWeight = 1 - secondaryWeight;
		const norm = primaryWeight * primaryWeight + secondaryWeight * secondaryWeight;
		const scale = norm > 0 ? 1 / norm : 1;
		updateRow(index, panDelta * primaryWeight * scale);
		updateRow(nextIndex, panDelta * secondaryWeight * scale);
		return changed;
	}

	function stopAllAnimations(): void {
		for (let i = 0; i < numRows; i++) {
			panAnimating[i] = false;
		}
	}

	function clearPointerTracking(): void {
		activePointerId = null;
		directionLocked = null;
		pointerSamples.length = 0;
	}

	function resetWheelState(): void {
		wheelAccumY = 0;
		wheelAxisLock = null;
		trackpadIgnored = false;
		trackpadActive = false;
		trackpadSettled = false;
		trackpadLastMagnitude = 0;
		trackpadPeakMagnitude = 0;
		trackpadDecayCount = 0;
		trackpadVelocity = 0;
		if (wheelSettleTimer) {
			clearTimeout(wheelSettleTimer);
			wheelSettleTimer = 0;
		}
	}

	function captureOrigins(): void {
		dragOriginStop = nearestStopIndex(verticalT);
		for (let i = 0; i < numRows; i++) {
			const points = panSnapPoints[i];
			panOriginSnap[i] = points && points.length > 0 ? nearestSnapPoint(panByRow[i], points) : 0;
		}
	}

	function settleAll(): boolean {
		let changed = beginVerticalAnimation(nearestStopIndex(verticalT));
		for (let i = 0; i < numRows; i++) {
			const points = panSnapPoints[i];
			if (points && points.length > 0) {
				changed = beginPanAnimation(i, nearestSnapPoint(panByRow[i], points)) || changed;
			}
		}
		return changed;
	}

	function onPointerDown(e: PointerEvent): boolean {
		if (e.button !== 0 || activePointerId !== null) return false;

		stopAllAnimations();
		resetWheelState();
		state = State.TRACKING;
		activePointerId = e.pointerId;
		pointerDownX = e.clientX;
		pointerDownY = e.clientY;
		pointerLastX = e.clientX;
		pointerLastY = e.clientY;
		directionLocked = null;
		pointerSamples.length = 0;
		pointerSamples.push({ x: e.clientX, y: e.clientY, t: performance.now() });
		pendingTap = null;
		captureOrigins();
		canvas.setPointerCapture?.(e.pointerId);
		return false;
	}

	function onPointerMove(e: PointerEvent): boolean {
		if (activePointerId !== e.pointerId) return false;
		if (state !== State.TRACKING && state !== State.DRAGGING) return false;

		const dx = e.clientX - pointerDownX;
		const dy = e.clientY - pointerDownY;
		const dist = Math.hypot(dx, dy);

		if (state === State.TRACKING) {
			if (dist < DIRECTION_LOCK_THRESHOLD) return false;
			directionLocked = Math.abs(dy) >= Math.abs(dx) ? "v" : "h";
			state = State.DRAGGING;
		}

		pointerSamples.push({ x: e.clientX, y: e.clientY, t: performance.now() });
		if (pointerSamples.length > 20) pointerSamples.shift();

		const moveDx = e.clientX - pointerLastX;
		const moveDy = e.clientY - pointerLastY;
		pointerLastX = e.clientX;
		pointerLastY = e.clientY;

		let changed = false;
		if (directionLocked === "v") {
			const rawT = getRawVertical();
			changed = setVerticalWithRubberBand(rawT - moveDy * dragVerticalSpeed);
		} else if (directionLocked === "h") {
			changed = applyPanDelta(-moveDx * DRAG_PAN_SPEED);
		}
		return changed ? markChanged() : false;
	}

	function onPointerUp(e: PointerEvent): boolean {
		if (activePointerId !== e.pointerId) return false;
		activePointerId = null;
		const lockedDir = directionLocked;
		if (canvas.hasPointerCapture?.(e.pointerId)) {
			canvas.releasePointerCapture(e.pointerId);
		}

		if (state === State.TRACKING) {
			const dx = e.clientX - pointerDownX;
			const dy = e.clientY - pointerDownY;
			if (dx * dx + dy * dy <= TAP_DISTANCE_THRESHOLD * TAP_DISTANCE_THRESHOLD) {
				pendingTap = { clientX: e.clientX, clientY: e.clientY };
			}
			clearPointerTracking();
			state = State.IDLE;
			return pendingTap !== null;
		}

		if (state !== State.DRAGGING) {
			clearPointerTracking();
			state = State.IDLE;
			return false;
		}

		const vel = estimateVelocity(pointerSamples);
		clearPointerTracking();

		if (prefersReducedMotion()) {
			verticalT = verticalStops[nearestStopIndex(verticalT)];
			for (let i = 0; i < numRows; i++) {
				const points = panSnapPoints[i];
				if (points && points.length > 0) {
					panByRow[i] = nearestSnapPoint(panByRow[i], points);
				}
			}
			state = State.IDLE;
			return markChanged();
		}

		let changed = false;
		if (lockedDir === "v") {
			changed = beginVerticalAnimation(chooseVerticalTarget(vel.vy), -vel.vy * dragVerticalSpeed);
			for (let i = 0; i < numRows; i++) {
				const points = panSnapPoints[i];
				if (points && points.length > 0) {
					changed = beginPanAnimation(i, nearestSnapPoint(panByRow[i], points)) || changed;
				}
			}
		} else if (lockedDir === "h") {
			// Apply the horizontal velocity only to the currently visible row; settle
			// all other rows to their nearest snap point without the flick velocity.
			const visibleRow = dragOriginStop;
			for (let i = 0; i < numRows; i++) {
				const target =
					i === visibleRow
						? choosePanTarget(i, -vel.vx)
						: (() => {
								const points = panSnapPoints[i];
								return points && points.length > 0 ? nearestSnapPoint(panByRow[i], points) : null;
							})();
				if (target !== null) {
					const velocity = i === visibleRow ? -vel.vx * DRAG_PAN_SPEED : 0;
					changed = beginPanAnimation(i, target, velocity) || changed;
				}
			}
			changed = beginVerticalAnimation(nearestStopIndex(verticalT)) || changed;
		} else {
			changed = settleAll();
		}
		return changed;
	}

	function onPointerCancel(e: PointerEvent): boolean {
		if (activePointerId !== e.pointerId) return false;
		activePointerId = null;
		if (canvas.hasPointerCapture?.(e.pointerId)) {
			canvas.releasePointerCapture(e.pointerId);
		}
		clearPointerTracking();
		pendingTap = null;
		return settleAll();
	}

	function cancelActiveGesture(): boolean {
		const hadWheel = trackpadActive;
		resetWheelState();
		if (activePointerId === null && !hadWheel) return false;
		clearPointerTracking();
		state = State.IDLE;
		pendingTap = null;
		return settleAll();
	}

	function wheelGestureEnd(): void {
		wheelAccumY = 0;
		// A slow trackpad gesture can end without any momentum: snap now.
		if (trackpadActive && !trackpadIgnored && !trackpadSettled) {
			// The fingers have been still for a beat, so the shelf was too.
			trackpadVelocity = 0;
			if (settleTrackpad(TRACKPAD_COMMIT)) inputDirty = true;
		}
		wheelAxisLock = null;
		trackpadIgnored = false;
		trackpadActive = false;
		trackpadSettled = false;
	}

	/** Glide to the nearest stop on the gesture's axis; a gesture that got
	 *  `commit` of the way to the next stop goes there instead of springing
	 *  back. Only that axis settles: a vertical scroll leaves every row's
	 *  sideways position alone (snapping them all made the bottom row jump to
	 *  a framing that cut the camera off), just as touch scrolling does. */
	function settleTrackpad(commit: number): boolean {
		const axis = wheelAxisLock;
		if (axis === "v") {
			return beginVerticalAnimation(settleVerticalTarget(commit), trackpadVelocity);
		}
		if (axis === "h") {
			const points = panSnapPoints[trackpadRow];
			if (!points || points.length === 0) return false;
			return beginPanAnimation(trackpadRow, settlePanTarget(trackpadRow, commit), trackpadVelocity);
		}
		return false;
	}

	function settleVerticalTarget(commit: number): number {
		const nearest = nearestStopIndex(verticalT);
		if (nearest !== dragOriginStop) return nearest;
		const displacement = verticalT - verticalStops[dragOriginStop];
		const next = verticalStopInDirection(dragOriginStop, displacement > 0 ? 1 : -1);
		if (next === null) return nearest;
		const gap = Math.abs(verticalStops[next] - verticalStops[dragOriginStop]);
		return Math.abs(displacement) > gap * commit ? next : nearest;
	}

	function settlePanTarget(row: number, commit: number): number {
		const points = panSnapPoints[row];
		const origin = panOriginSnap[row];
		const nearest = nearestSnapPoint(panByRow[row], points);
		if (Math.abs(nearest - origin) > 0.0001) return nearest;
		const displacement = panByRow[row] - origin;
		const next = panSnapInDirection(row, origin, displacement > 0 ? 1 : -1);
		if (next === null) return nearest;
		return Math.abs(displacement) > Math.abs(next - origin) * commit ? next : nearest;
	}

	function armWheelSettle(): void {
		if (wheelSettleTimer) clearTimeout(wheelSettleTimer);
		wheelSettleTimer = window.setTimeout(() => {
			wheelSettleTimer = 0;
			wheelGestureEnd();
		}, WHEEL_SETTLE_DELAY_MS);
	}

	function findNearestLinearIndex(): number {
		const currentStop = nearestStopIndex(verticalT);
		let bestIdx = linearIndex;
		let bestDist = Number.POSITIVE_INFINITY;
		for (let i = 0; i < linearSequence.length; i++) {
			const entry = linearSequence[i];
			if (entry.row !== currentStop) continue;
			const panDist = Math.abs(panByRow[entry.row] - entry.panTarget);
			if (panDist < bestDist) {
				bestIdx = i;
				bestDist = panDist;
			}
		}
		return bestIdx;
	}

	function navigateToLinearStop(idx: number): boolean {
		const target = linearSequence[idx];
		linearIndex = idx;

		if (prefersReducedMotion()) {
			verticalT = verticalStops[target.stopIndex];
			panByRow[target.row] = target.panTarget;
			for (let i = 0; i < numRows; i++) {
				if (i === target.row) continue;
				const points = panSnapPoints[i];
				if (points && points.length > 0) {
					panByRow[i] = nearestSnapPoint(panByRow[i], points);
				}
			}
			state = State.IDLE;
			stopAllAnimations();
			return true;
		}

		let changed = beginVerticalAnimation(target.stopIndex);
		changed = beginPanAnimation(target.row, target.panTarget) || changed;
		// Snap other rows to their nearest snap point
		for (let i = 0; i < numRows; i++) {
			if (i === target.row) continue;
			const points = panSnapPoints[i];
			if (points && points.length > 0) {
				changed = beginPanAnimation(i, nearestSnapPoint(panByRow[i], points)) || changed;
			}
		}
		return changed;
	}

	function onWheelDiscrete(rawY: number, now: number): boolean {
		wheelAccumY += rawY;
		if (
			Math.abs(wheelAccumY) < WHEEL_PAGE_THRESHOLD ||
			now - lastWheelPageTimeY < WHEEL_COOLDOWN_MS
		) {
			armWheelSettle();
			return false;
		}

		// Sync linear index to current position in case touch/trackpad moved us
		linearIndex = findNearestLinearIndex();

		const dir = wheelAccumY > 0 ? 1 : -1;
		const nextIdx = clamp(linearIndex + dir, 0, linearSequence.length - 1);
		wheelAccumY = 0;
		lastWheelPageTimeY = now;
		armWheelSettle();

		if (nextIdx === linearIndex) return false;
		return navigateToLinearStop(nextIdx);
	}

	function hasHorizontalContent(): boolean {
		const stopIdx = nearestStopIndex(verticalT);
		const points = panSnapPoints[stopIdx];
		return !!points && points.length > 1;
	}

	/** Index of the nearest vertical stop from `fromIndex` moving verticalT in `dir`. */
	function verticalStopInDirection(fromIndex: number, dir: -1 | 1): number | null {
		const from = verticalStops[fromIndex];
		let best: number | null = null;
		let bestDist = Number.POSITIVE_INFINITY;
		for (let i = 0; i < verticalStops.length; i++) {
			const dist = (verticalStops[i] - from) * dir;
			if (dist > 0.0001 && dist < bestDist) {
				best = i;
				bestDist = dist;
			}
		}
		return best;
	}

	/** Nearest pan snap point from `from` in `dir` on `row`, if any. */
	function panSnapInDirection(row: number, from: number, dir: -1 | 1): number | null {
		const points = panSnapPoints[row];
		if (!points) return null;
		let best: number | null = null;
		let bestDist = Number.POSITIVE_INFINITY;
		for (const point of points) {
			const dist = (point - from) * dir;
			if (dist > 0.0001 && dist < bestDist) {
				best = point;
				bestDist = dist;
			}
		}
		return best;
	}

	function onWheelContinuous(rawY: number, rawX: number, now: number): boolean {
		const sinceLast = now - trackpadLastEventAt;
		const quiet = sinceLast > TRACKPAD_GESTURE_GAP_MS;
		trackpadLastEventAt = now;
		const magnitude = Math.hypot(rawY, rawX);
		const previousMagnitude = trackpadLastMagnitude;
		trackpadLastMagnitude = magnitude;
		const newSwipe =
			trackpadSettled &&
			magnitude > TRACKPAD_NEW_SWIPE_MIN_PX &&
			magnitude > previousMagnitude * TRACKPAD_NEW_SWIPE_RATIO;

		if (quiet || newSwipe || !trackpadActive) {
			// A new gesture takes over from wherever the shelf is right now,
			// including mid-glide, so quick repeated swipes all register.
			trackpadActive = true;
			trackpadIgnored = false;
			trackpadSettled = false;
			trackpadDecayCount = 0;
			trackpadPeakMagnitude = 0;
			trackpadVelocity = 0;
			trackpadLockX = 0;
			trackpadLockY = 0;
			wheelAxisLock = null;
			state = State.IDLE;
			stopAllAnimations();
			captureOrigins();
			trackpadRow = dragOriginStop;
			trackpadRawV = getRawVertical();
			trackpadRawPan = panByRow[trackpadRow];
		}

		armWheelSettle();
		if (trackpadIgnored || trackpadSettled) return false;

		// Fingers lifted: the deltas start shrinking steadily. Snap now, in the
		// direction of travel, rather than riding the momentum.
		trackpadPeakMagnitude = Math.max(trackpadPeakMagnitude, magnitude);
		const decaying =
			magnitude > 0 &&
			(magnitude <= previousMagnitude * TRACKPAD_MOMENTUM_DECAY ||
				(magnitude <= 2 && magnitude <= previousMagnitude));
		trackpadDecayCount = decaying ? trackpadDecayCount + 1 : 0;
		if (
			wheelAxisLock &&
			trackpadDecayCount >= TRACKPAD_MOMENTUM_EVENTS &&
			magnitude <= trackpadPeakMagnitude * TRACKPAD_MOMENTUM_PEAK_RATIO
		) {
			trackpadSettled = true;
			return settleTrackpad(TRACKPAD_FLICK_COMMIT);
		}

		// Pick the axis from the accumulated motion, not the first event: swipes
		// rarely start perfectly straight.
		if (!wheelAxisLock) {
			trackpadLockX += rawX;
			trackpadLockY += rawY;
			if (Math.hypot(trackpadLockX, trackpadLockY) < TRACKPAD_AXIS_LOCK_PX) return false;
			const horizontal = Math.abs(trackpadLockX) > Math.abs(trackpadLockY);
			// A sideways swipe on a row with nothing to pan to is ignored rather
			// than reinterpreted as vertical.
			if (horizontal && !hasHorizontalContent()) {
				trackpadIgnored = true;
				return false;
			}
			wheelAxisLock = horizontal ? "h" : "v";
			// Count the travel that went into deciding.
			rawX = trackpadLockX;
			rawY = trackpadLockY;
		}

		// Scrolling down/right moves verticalT/pan down, matching touch drags.
		const delta =
			wheelAxisLock === "v" ? -rawY * trackpadVerticalSpeed : -rawX * TRACKPAD_PAN_SPEED;
		// Events arrive every ~16 ms; a long gap means the speed is unknown.
		if (!quiet && sinceLast > 0) {
			const sample = delta / (Math.max(sinceLast, 8) / 1000);
			trackpadVelocity += (sample - trackpadVelocity) * TRACKPAD_VELOCITY_SMOOTHING;
		}
		if (wheelAxisLock === "v") {
			trackpadRawV += delta;
			return setVerticalWithRubberBand(trackpadRawV);
		}
		trackpadRawPan += delta;
		return setPanWithRubberBand(trackpadRow, trackpadRawPan);
	}

	/** Follow a sideways swipe, easing into a short pull past the row's ends. */
	function setPanWithRubberBand(row: number, raw: number): boolean {
		const points = panSnapPoints[row];
		const min = Math.min(...points);
		const max = Math.max(...points);
		let next = raw;
		if (raw < min)
			next = min - TRACKPAD_PAN_EDGE * (1 - Math.exp(-(min - raw) / TRACKPAD_PAN_EDGE));
		else if (raw > max) {
			next = max + TRACKPAD_PAN_EDGE * (1 - Math.exp(-(raw - max) / TRACKPAD_PAN_EDGE));
		}
		if (Math.abs(next - panByRow[row]) < 0.0001) return false;
		panByRow[row] = next;
		return true;
	}

	function onWheel(e: WheelEvent): boolean {
		e.preventDefault();

		const now = performance.now();
		const rawY = normalizeWheelDelta(e.deltaY, e.deltaMode);
		const rawX = normalizeWheelDelta(e.deltaX, e.deltaMode);

		// Keep trackpads on the continuous path. Pixel-mode mouse wheels on
		// Chrome/Edge usually arrive as isolated 100/120-step vertical deltas,
		// while trackpads are much more variable and often include horizontal data.
		const discrete = isLikelyDiscretePixelWheelEvent(e);

		if (discrete) {
			// Linear item navigation — no axis lock needed, vertical only
			const changed = onWheelDiscrete(rawY, now);
			return changed ? markChanged() : false;
		}

		const changed = onWheelContinuous(rawY, rawX, now);
		return changed ? markChanged() : false;
	}

	function tick(dt: number): boolean {
		const hadInput = inputDirty;
		inputDirty = false;
		let changed = hadInput;

		if (state === State.ANIMATING) {
			const next = springStep(verticalT, animVelocity, animTargetT, dt);
			verticalT = next.x;
			animVelocity = next.v;
			changed = true;
			if (springAtRest(next.x, next.v, animTargetT)) {
				verticalT = animTargetT;
				animVelocity = 0;
				state = State.IDLE;
			}
		}

		for (let i = 0; i < numRows; i++) {
			if (!panAnimating[i]) continue;
			const next = springStep(panByRow[i], panVelocity[i], panAnimTarget[i], dt);
			panByRow[i] = next.x;
			panVelocity[i] = next.v;
			changed = true;
			if (springAtRest(next.x, next.v, panAnimTarget[i])) {
				panByRow[i] = panAnimTarget[i];
				panVelocity[i] = 0;
				panAnimating[i] = false;
			}
		}

		return changed;
	}

	function consumeTap(): TapPoint | null {
		const tap = pendingTap;
		pendingTap = null;
		return tap;
	}

	function resetTo(t: number): boolean {
		const next = clamp(t, 0, 1);
		const changed =
			Math.abs(verticalT - next) > 0.0001 || panByRow.some((value) => Math.abs(value) > 0.0001);
		verticalT = next;
		state = State.IDLE;
		stopAllAnimations();
		clearPointerTracking();
		pendingTap = null;
		inputDirty = false;
		resetWheelState();
		for (let i = 0; i < numRows; i++) {
			panByRow[i] = 0;
		}
		return changed;
	}

	function dispose(): void {
		state = State.IDLE;
		stopAllAnimations();
		clearPointerTracking();
		pendingTap = null;
		inputDirty = false;
		resetWheelState();
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
			return verticalT;
		},
		get panByRow() {
			return panByRow;
		},
		consumeTap,
		navigateToLinearStop(idx: number): boolean {
			const clamped = clamp(idx, 0, linearSequence.length - 1);
			return navigateToLinearStop(clamped) ? markChanged() : false;
		},
		resetTo,
		dispose,
	};
}
