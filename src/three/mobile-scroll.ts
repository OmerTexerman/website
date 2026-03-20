import { clamp, lerp } from "./math-utils";

// ─── Types ───────────────────────────────────────────────────────

export interface MobileScrollConfig {
	/** Normalized vertical stop values, e.g. [0, 0.5, 1] */
	verticalStops: readonly number[];
	/** Per-row horizontal snap points */
	panSnapPoints: readonly (readonly number[])[];
	/** Max horizontal pan magnitude */
	panLimit: number;
	/** Number of shelf rows (matches MOBILE_SHELF_STOPS.length) */
	numRows: number;
	/** Wheel → vertical-t scale */
	wheelSpeed: number;
	/** Wheel → horizontal pan scale */
	wheelPanSpeed: number;
}

export interface MobileScrollController {
	onPointerDown(e: PointerEvent): void;
	onPointerMove(e: PointerEvent): void;
	onPointerUp(e: PointerEvent): void;
	onPointerCancel(e: PointerEvent): void;
	cancelActiveGesture(): void;
	onWheel(e: WheelEvent): void;
	/** Advance physics by dt seconds. Returns true if camera position changed. */
	tick(dt: number): boolean;
	/** Current vertical track position (0–1, may exceed during rubber-band) */
	readonly verticalT: number;
	/** Current per-row horizontal pan values */
	readonly panByRow: readonly number[];
	/** Consume a pending tap event, or null if none */
	consumeTap(): { clientX: number; clientY: number } | null;
	/** Hard-reset position (used after transitions) */
	resetTo(t: number): void;
	dispose(): void;
}

// ─── State machine ───────────────────────────────────────────────

enum State {
	IDLE = 0,
	TRACKING = 1,
	DRAGGING = 2,
	DECELERATING = 3,
	SNAPPING = 4,
}

// ─── Constants ───────────────────────────────────────────────────

const TAP_DISTANCE_THRESHOLD = 10; // px — larger than old 6px for high-DPI
const DIRECTION_LOCK_THRESHOLD = 8; // px before locking V or H
const DECELERATION_RATE = 6.0; // velocity halves every ~115ms (smoother coast)
const DECELERATION_STOP = 0.001; // velocity magnitude to stop decelerating
const SNAP_STIFFNESS = 55;
const SNAP_DAMPING = 16; // slightly overdamped — no oscillation
const SNAP_SETTLE = 0.0005; // position + velocity threshold to settle
const RUBBER_BAND_FACTOR = 0.35;
const VELOCITY_WINDOW_MS = 100;
const PAN_DECELERATION_RATE = 6.0;
const PAN_SNAP_STIFFNESS = 55;
const PAN_SNAP_DAMPING = 16;
const PAN_SNAP_SETTLE = 0.0005;
const WHEEL_LINE_PIXELS = 16;
const WHEEL_DELTA_CAP = 80;
const WHEEL_RESPONSE_CURVE = 0.82;
const WHEEL_VELOCITY_BOOST = 0.6; // scale wheel delta into velocity units

// ─── Helpers ─────────────────────────────────────────────────────

interface PointerSample {
	x: number;
	y: number;
	t: number;
}

interface TapPoint {
	clientX: number;
	clientY: number;
}

const prefersReducedMotion =
	typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function rubberBand(overscroll: number, limit: number): number {
	// Diminishing returns: f(x) = factor * limit * (1 - exp(-x / limit))
	const sign = Math.sign(overscroll);
	const abs = Math.abs(overscroll);
	return sign * RUBBER_BAND_FACTOR * limit * (1 - Math.exp(-abs / (limit * 0.5)));
}

function estimateVelocity(samples: PointerSample[]): { vx: number; vy: number } {
	if (samples.length < 2) return { vx: 0, vy: 0 };

	// Simple linear regression over samples in the velocity window
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
		const t = (s.t - last.t) / 1000; // seconds relative to last sample
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

function normalizeWheelDelta(delta: number, deltaMode: number): number {
	if (deltaMode === 1) return delta * WHEEL_LINE_PIXELS;
	if (deltaMode === 2) {
		const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 800;
		return delta * viewportHeight;
	}
	return delta;
}

function dampWheelDelta(delta: number, deltaMode: number): number {
	const normalized = normalizeWheelDelta(delta, deltaMode);
	const sign = Math.sign(normalized);
	const magnitude = Math.min(Math.abs(normalized), WHEEL_DELTA_CAP);
	return sign * magnitude ** WHEEL_RESPONSE_CURVE;
}

// ─── Controller factory ─────────────────────────────────────────

export function createMobileScrollController(
	canvas: HTMLCanvasElement,
	config: MobileScrollConfig,
): MobileScrollController {
	const { verticalStops, panSnapPoints, panLimit, numRows, wheelSpeed, wheelPanSpeed } = config;

	// ── Vertical state ──
	let state: State = State.IDLE;
	let verticalT = 0.5;
	let verticalVelocity = 0; // in t-units per second
	let snapTarget = 0.5;
	let snapVelocity = 0; // used by snap spring

	// ── Horizontal pan state (per row) ──
	const panByRow: number[] = Array.from({ length: numRows }, () => 0);
	const panVelocityByRow: number[] = Array.from({ length: numRows }, () => 0);
	const panSnapping: boolean[] = Array.from({ length: numRows }, () => false);
	const panSnapTargets: number[] = Array.from({ length: numRows }, () => 0);
	const panSnapVelocities: number[] = Array.from({ length: numRows }, () => 0);

	// ── Pointer tracking ──
	let activePointerId: number | null = null;
	let pointerDownX = 0;
	let pointerDownY = 0;
	let pointerLastX = 0;
	let pointerLastY = 0;
	let directionLocked: "v" | "h" | null = null;
	const pointerSamples: PointerSample[] = [];
	let pendingTap: TapPoint | null = null;
	let inputDirty = false; // set by input handlers, cleared by tick

	// ── Input conversion constants ──
	// Lower than old values (0.007/0.006) because 1:1 tracking has no lerp buffer
	const DRAG_VERTICAL_SPEED = 0.003;
	const DRAG_PAN_SPEED = 0.003;

	/** Get the nearest vertical stop value */
	function nearestVerticalStop(t: number): number {
		return nearestSnapPoint(clamp(t, 0, 1), verticalStops);
	}

	function stopAllMotion(): void {
		verticalVelocity = 0;
		snapVelocity = 0;
		for (let i = 0; i < numRows; i++) {
			panVelocityByRow[i] = 0;
			panSnapping[i] = false;
			panSnapVelocities[i] = 0;
		}
	}

	function clearPointerTracking(): void {
		activePointerId = null;
		directionLocked = null;
		pointerSamples.length = 0;
	}

	function beginVerticalSnapping(target = nearestVerticalStop(verticalT)): void {
		snapTarget = target;
		snapVelocity = 0;
		state = State.SNAPPING;
	}

	function getPanDistribution(): {
		index: number;
		nextIndex: number;
		primaryWeight: number;
		secondaryWeight: number;
		scale: number;
	} {
		const clamped = clamp(verticalT, 0, 1);
		const scaled = clamped * (numRows - 1);
		const index = Math.floor(scaled);
		const nextIndex = Math.min(index + 1, numRows - 1);
		if (index === nextIndex) {
			return {
				index,
				nextIndex,
				primaryWeight: 1,
				secondaryWeight: 0,
				scale: 1,
			};
		}

		const secondaryWeight = scaled - index;
		const primaryWeight = 1 - secondaryWeight;
		const normalization = primaryWeight * primaryWeight + secondaryWeight * secondaryWeight;

		return {
			index,
			nextIndex,
			primaryWeight,
			secondaryWeight,
			scale: normalization > 0 ? 1 / normalization : 1,
		};
	}

	/** Apply vertical position with rubber-banding at edges */
	function setVerticalWithRubberBand(raw: number): void {
		if (raw < 0) {
			verticalT = rubberBand(raw, 1);
		} else if (raw > 1) {
			verticalT = 1 + rubberBand(raw - 1, 1);
		} else {
			verticalT = raw;
		}
	}

	/** Get the "raw" (unclamped) vertical position for drag math */
	function getRawVertical(): number {
		// Invert rubber band — for positions outside [0,1], estimate the raw value
		if (verticalT >= 0 && verticalT <= 1) return verticalT;
		if (verticalT < 0) {
			// rubberBand(x, 1) = 0.35 * (1 - exp(-x/0.5))
			// solve: verticalT = 0.35 * (1 - exp(-x/0.5)) → x = -0.5 * ln(1 - verticalT/0.35)
			const ratio = verticalT / -RUBBER_BAND_FACTOR;
			if (ratio >= 1) return -2; // safety cap
			return 0.5 * Math.log(1 - ratio);
		}
		const over = verticalT - 1;
		const ratio = over / RUBBER_BAND_FACTOR;
		if (ratio >= 1) return 3; // safety cap
		return 1 - 0.5 * Math.log(1 - ratio);
	}

	/** Apply pan delta distributed by current vertical position */
	function applyPanDelta(panDelta: number): void {
		const { index, nextIndex, primaryWeight, secondaryWeight, scale } = getPanDistribution();
		const primaryDelta = panDelta * primaryWeight * scale;
		panByRow[index] = clamp(panByRow[index] + primaryDelta, -panLimit, panLimit);

		if (index === nextIndex) {
			return;
		}

		const secondaryDelta = panDelta * secondaryWeight * scale;
		panByRow[nextIndex] = clamp(panByRow[nextIndex] + secondaryDelta, -panLimit, panLimit);
	}

	function applyPanVelocity(panVelocity: number): void {
		const { index, nextIndex, primaryWeight, secondaryWeight, scale } = getPanDistribution();
		panVelocityByRow[index] += panVelocity * primaryWeight * scale;
		if (index === nextIndex) return;
		panVelocityByRow[nextIndex] += panVelocity * secondaryWeight * scale;
	}

	function beginPanSnapping(): void {
		for (let i = 0; i < numRows; i++) {
			const points = panSnapPoints[i];
			if (!points || points.length === 0) continue;
			const nearest = nearestSnapPoint(panByRow[i], points);
			panSnapping[i] = true;
			panSnapTargets[i] = nearest;
			panSnapVelocities[i] = panVelocityByRow[i];
		}
	}

	function settleAfterGestureCancel(): void {
		clearPointerTracking();
		pendingTap = null;
		beginPanSnapping();
		beginVerticalSnapping();
	}

	// ── Pointer handlers ──

	function onPointerDown(e: PointerEvent): void {
		if (e.button !== 0 || activePointerId !== null) return;

		stopAllMotion();

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
		canvas.setPointerCapture?.(e.pointerId);
	}

	function onPointerMove(e: PointerEvent): void {
		if (activePointerId !== e.pointerId) return;
		if (state !== State.TRACKING && state !== State.DRAGGING) return;

		const dx = e.clientX - pointerDownX;
		const dy = e.clientY - pointerDownY;
		const dist = Math.sqrt(dx * dx + dy * dy);

		if (state === State.TRACKING) {
			if (dist < DIRECTION_LOCK_THRESHOLD) return; // not enough movement yet
			// Lock direction
			directionLocked = Math.abs(dy) >= Math.abs(dx) ? "v" : "h";
			state = State.DRAGGING;
		}

		// Record sample for velocity estimation
		pointerSamples.push({ x: e.clientX, y: e.clientY, t: performance.now() });
		if (pointerSamples.length > 20) pointerSamples.shift();

		const moveDx = e.clientX - pointerLastX;
		const moveDy = e.clientY - pointerLastY;
		pointerLastX = e.clientX;
		pointerLastY = e.clientY;

		if (directionLocked === "v") {
			// Vertical drag: camera follows finger 1:1
			const rawT = getRawVertical();
			const newRaw = rawT + moveDy * DRAG_VERTICAL_SPEED;
			setVerticalWithRubberBand(newRaw);
			inputDirty = true;
		} else if (directionLocked === "h") {
			applyPanDelta(-moveDx * DRAG_PAN_SPEED);
			inputDirty = true;
		}
	}

	function onPointerUp(e: PointerEvent): void {
		if (activePointerId !== e.pointerId) return;
		activePointerId = null;
		const lockedDirection = directionLocked;
		canvas.releasePointerCapture?.(e.pointerId);

		if (state === State.TRACKING) {
			// Didn't move enough to drag — it's a tap
			const dx = e.clientX - pointerDownX;
			const dy = e.clientY - pointerDownY;
			if (dx * dx + dy * dy <= TAP_DISTANCE_THRESHOLD * TAP_DISTANCE_THRESHOLD) {
				pendingTap = { clientX: e.clientX, clientY: e.clientY };
			}
			directionLocked = null;
			pointerSamples.length = 0;
			state = State.IDLE;
			return;
		}

		if (state !== State.DRAGGING) {
			directionLocked = null;
			pointerSamples.length = 0;
			state = State.IDLE;
			return;
		}

		// Estimate velocity from pointer samples
		const vel = estimateVelocity(pointerSamples);

		if (prefersReducedMotion) {
			// Skip momentum, snap immediately
			verticalT = clamp(verticalT, 0, 1);
			verticalT = nearestVerticalStop(verticalT);
			snapToNearestPanPoints();
			directionLocked = null;
			pointerSamples.length = 0;
			state = State.IDLE;
			return;
		}

		if (lockedDirection === "v") {
			verticalVelocity = vel.vy * DRAG_VERTICAL_SPEED;
			state = State.DECELERATING;
		} else if (lockedDirection === "h") {
			applyPanVelocity(-vel.vx * DRAG_PAN_SPEED);
			// Also snap vertically so we don't stay floating between rows
			beginVerticalSnapping();
		} else {
			state = State.IDLE;
		}

		directionLocked = null;
		pointerSamples.length = 0;
	}

	function onPointerCancel(e: PointerEvent): void {
		if (activePointerId !== e.pointerId) return;
		activePointerId = null;
		canvas.releasePointerCapture?.(e.pointerId);
		settleAfterGestureCancel();
	}

	function cancelActiveGesture(): void {
		if (activePointerId === null) return;
		settleAfterGestureCancel();
	}

	function onWheel(e: WheelEvent): void {
		e.preventDefault();
		const deltaY = dampWheelDelta(e.deltaY, e.deltaMode);
		const deltaX = dampWheelDelta(e.deltaX, e.deltaMode);

		// Accumulate vertical velocity (adds to existing momentum)
		verticalVelocity -= deltaY * wheelSpeed * WHEEL_VELOCITY_BOOST;
		if (state !== State.DECELERATING) {
			state = State.DECELERATING;
		}

		// Horizontal pan — apply directly with gentle snap
		if (Math.abs(deltaX) > 0.1) {
			applyPanDelta(-deltaX * wheelPanSpeed);
			snapPanGently();
		}

		inputDirty = true;
	}

	// ── Pan snapping helpers ──

	function snapToNearestPanPoints(): void {
		for (let i = 0; i < numRows; i++) {
			const points = panSnapPoints[i];
			if (!points || points.length === 0) continue;
			panByRow[i] = nearestSnapPoint(panByRow[i], points);
			panVelocityByRow[i] = 0;
			panSnapping[i] = false;
		}
	}

	function snapPanGently(): void {
		for (let i = 0; i < numRows; i++) {
			const points = panSnapPoints[i];
			if (!points || points.length === 0) continue;
			const nearest = nearestSnapPoint(panByRow[i], points);
			panByRow[i] = lerp(panByRow[i], nearest, 0.3);
		}
	}

	// ── Physics tick ──

	function tick(dt: number): boolean {
		// Consume input-driven changes (drag, wheel)
		const hadInput = inputDirty;
		inputDirty = false;

		let changed = hadInput;

		if (state === State.DECELERATING) {
			changed = tickDeceleration(dt) || changed;
		} else if (state === State.SNAPPING) {
			changed = tickSnapping(dt) || changed;
		}

		changed = tickPanDeceleration(dt) || changed;
		changed = tickPanSnapping(dt) || changed;

		return changed;
	}

	function tickDeceleration(dt: number): boolean {
		if (Math.abs(verticalVelocity) < DECELERATION_STOP && verticalT >= 0 && verticalT <= 1) {
			// Velocity died down and we're in bounds — transition to snapping
			verticalVelocity = 0;
			snapTarget = nearestVerticalStop(verticalT);
			snapVelocity = 0;
			beginPanSnapping();
			state = State.SNAPPING;
			return true;
		}

		// Apply exponential decay: v *= exp(-rate * dt)
		verticalVelocity *= Math.exp(-DECELERATION_RATE * dt);
		verticalT += verticalVelocity * dt;

		// Rubber-band at edges during deceleration
		if (verticalT < 0) {
			verticalT = rubberBand(verticalT, 0.3);
			// Extra damping when overscrolled
			verticalVelocity *= Math.exp(-20 * dt);
			if (Math.abs(verticalVelocity) < DECELERATION_STOP) {
				snapTarget = 0;
				snapVelocity = 0;
				beginPanSnapping();
				state = State.SNAPPING;
			}
		} else if (verticalT > 1) {
			verticalT = 1 + rubberBand(verticalT - 1, 0.3);
			verticalVelocity *= Math.exp(-20 * dt);
			if (Math.abs(verticalVelocity) < DECELERATION_STOP) {
				snapTarget = 1;
				snapVelocity = 0;
				beginPanSnapping();
				state = State.SNAPPING;
			}
		}

		return true;
	}

	function tickSnapping(dt: number): boolean {
		// Damped spring: F = -stiffness * (x - target) - damping * v
		const displacement = verticalT - snapTarget;
		const force = -SNAP_STIFFNESS * displacement - SNAP_DAMPING * snapVelocity;
		snapVelocity += force * dt;
		verticalT += snapVelocity * dt;

		if (Math.abs(displacement) < SNAP_SETTLE && Math.abs(snapVelocity) < SNAP_SETTLE) {
			verticalT = snapTarget;
			snapVelocity = 0;
			state = State.IDLE;
			return true;
		}

		return true;
	}

	function tickPanDeceleration(dt: number): boolean {
		let changed = false;
		for (let i = 0; i < numRows; i++) {
			if (Math.abs(panVelocityByRow[i]) < DECELERATION_STOP) {
				if (panVelocityByRow[i] !== 0) {
					panVelocityByRow[i] = 0;
					// Start snapping this row to nearest point
					const points = panSnapPoints[i];
					if (points && points.length > 0) {
						const nearest = nearestSnapPoint(panByRow[i], points);
						panSnapping[i] = true;
						panSnapTargets[i] = nearest;
						panSnapVelocities[i] = 0;
					}
					changed = true;
				}
				continue;
			}

			panVelocityByRow[i] *= Math.exp(-PAN_DECELERATION_RATE * dt);
			panByRow[i] += panVelocityByRow[i] * dt;
			panByRow[i] = clamp(panByRow[i], -panLimit, panLimit);
			changed = true;
		}
		return changed;
	}

	function tickPanSnapping(dt: number): boolean {
		let changed = false;
		for (let i = 0; i < numRows; i++) {
			if (!panSnapping[i]) continue;

			const displacement = panByRow[i] - panSnapTargets[i];
			const force = -PAN_SNAP_STIFFNESS * displacement - PAN_SNAP_DAMPING * panSnapVelocities[i];
			panSnapVelocities[i] += force * dt;
			panByRow[i] += panSnapVelocities[i] * dt;

			if (
				Math.abs(displacement) < PAN_SNAP_SETTLE &&
				Math.abs(panSnapVelocities[i]) < PAN_SNAP_SETTLE
			) {
				panByRow[i] = panSnapTargets[i];
				panSnapVelocities[i] = 0;
				panSnapping[i] = false;
			}

			changed = true;
		}
		return changed;
	}

	function consumeTap(): TapPoint | null {
		const tap = pendingTap;
		pendingTap = null;
		return tap;
	}

	function resetTo(t: number): void {
		verticalT = t;
		stopAllMotion();
		state = State.IDLE;
		clearPointerTracking();
		pendingTap = null;
		inputDirty = false;
		for (let i = 0; i < numRows; i++) {
			panByRow[i] = 0;
		}
	}

	function dispose(): void {
		stopAllMotion();
		clearPointerTracking();
		pendingTap = null;
		inputDirty = false;
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
		resetTo,
		dispose,
	};
}
