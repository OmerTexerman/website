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
	/** Wheel → vertical-t scale (unused, kept for interface compat) */
	wheelSpeed: number;
	/** Wheel → horizontal pan scale (unused, kept for interface compat) */
	wheelPanSpeed: number;
}

export interface MobileScrollController {
	onPointerDown(e: PointerEvent): void;
	onPointerMove(e: PointerEvent): void;
	onPointerUp(e: PointerEvent): void;
	onPointerCancel(e: PointerEvent): void;
	cancelActiveGesture(): void;
	onWheel(e: WheelEvent): void;
	/** Advance animation by dt seconds. Returns true if camera position changed. */
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
//
// iOS-style paging: only 4 states, no coast/decelerate.
//   IDLE      → waiting for input
//   TRACKING  → pointer down, waiting for direction lock
//   DRAGGING  → finger down, content tracks 1:1
//   ANIMATING → finger lifted, easing to committed target

enum State {
	IDLE = 0,
	TRACKING = 1,
	DRAGGING = 2,
	ANIMATING = 3,
}

// ─── Constants ───────────────────────────────────────────────────

const TAP_DISTANCE_THRESHOLD = 10; // px
const DIRECTION_LOCK_THRESHOLD = 8; // px before locking V or H

// Paging target selection
const FLICK_VELOCITY_THRESHOLD = 200; // px/s — above this, velocity determines target
const POSITION_COMMIT_RATIO = 0.35; // drag past 35% of stop gap → commit to next

// Animation
const ANIMATE_DURATION = 0.35; // seconds for ease-out animation

// Rubber-banding during drag
const RUBBER_BAND_FACTOR = 0.35;

// Velocity estimation
const VELOCITY_WINDOW_MS = 100;

// Wheel paging
const WHEEL_LINE_PIXELS = 16;
const WHEEL_PAGE_THRESHOLD = 40; // accumulated px before paging
const WHEEL_COOLDOWN_MS = 200; // minimum ms between wheel page changes

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

/** Quadratic ease-out: fast start, smooth deceleration */
function easeOut(t: number): number {
	return 1 - (1 - t) * (1 - t);
}

function normalizeWheelDelta(delta: number, deltaMode: number): number {
	if (deltaMode === 1) return delta * WHEEL_LINE_PIXELS;
	if (deltaMode === 2) {
		return delta * (typeof window !== "undefined" ? window.innerHeight : 800);
	}
	return delta;
}

// ─── Controller factory ─────────────────────────────────────────

export function createMobileScrollController(
	canvas: HTMLCanvasElement,
	config: MobileScrollConfig,
): MobileScrollController {
	const { verticalStops, panSnapPoints, panLimit, numRows } = config;

	// ── Vertical state ──
	let state: State = State.IDLE;
	let verticalT = 0.5;
	let dragOriginStop = 1; // which stop index we started dragging from

	// ── Animation state (shared for vertical) ──
	let animStartT = 0; // vertical position at animation start
	let animTargetT = 0; // vertical position target
	let animElapsed = 0; // seconds since animation began
	let animDuration = ANIMATE_DURATION;

	// ── Horizontal pan state (per row) ──
	const panByRow: number[] = Array.from({ length: numRows }, () => 0);
	const panOriginSnap: number[] = Array.from({ length: numRows }, () => 0);
	// Per-row pan animation
	const panAnimating: boolean[] = Array.from({ length: numRows }, () => false);
	const panAnimStart: number[] = Array.from({ length: numRows }, () => 0);
	const panAnimTarget: number[] = Array.from({ length: numRows }, () => 0);
	const panAnimElapsed: number[] = Array.from({ length: numRows }, () => 0);

	// ── Pointer tracking ──
	let activePointerId: number | null = null;
	let pointerDownX = 0;
	let pointerDownY = 0;
	let pointerLastX = 0;
	let pointerLastY = 0;
	let directionLocked: "v" | "h" | null = null;
	const pointerSamples: PointerSample[] = [];
	let pendingTap: TapPoint | null = null;
	let inputDirty = false;

	// ── Wheel accumulator (independent per axis) ──
	let wheelAccumY = 0;
	let wheelAccumX = 0;
	let lastWheelPageTimeY = 0;
	let lastWheelPageTimeX = 0;
	let wheelAxisLock: "v" | "h" | null = null;
	let wheelAxisLockTime = 0;
	const WHEEL_AXIS_LOCK_MS = 150; // lock to dominant axis for this duration

	// ── Input conversion ──
	const DRAG_VERTICAL_SPEED = 0.003;
	const DRAG_PAN_SPEED = 0.003;

	// ── Helpers ──

	/** Index of the nearest vertical stop */
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

	/** Get stop index in a direction from current, clamped to bounds */
	function adjacentStopIndex(fromIndex: number, direction: -1 | 1): number {
		return clamp(fromIndex + direction, 0, verticalStops.length - 1);
	}

	/** Choose the vertical target stop based on velocity and position (iOS-style) */
	function chooseVerticalTarget(velocityPx: number): number {
		const clamped = clamp(verticalT, 0, 1);

		// Fast flick → advance one stop in flick direction
		if (Math.abs(velocityPx) > FLICK_VELOCITY_THRESHOLD) {
			// Positive velocity = dragging down = scrolling up (toward lower T)
			const dir = velocityPx > 0 ? -1 : 1;
			return adjacentStopIndex(dragOriginStop, dir as -1 | 1);
		}

		// Slow drag → use position to decide
		const originT = verticalStops[dragOriginStop];
		const displacement = clamped - originT;

		// Find the gap to the adjacent stop in the drag direction
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

		// Not past threshold — return to origin
		return dragOriginStop;
	}

	/** Choose the horizontal pan target for a row based on velocity and position */
	function choosePanTarget(row: number, velocityPx: number): number | null {
		const points = panSnapPoints[row];
		if (!points || points.length === 0) return null;

		const originSnap = panOriginSnap[row];
		const current = panByRow[row];

		// Fast flick → advance to next snap in flick direction
		if (Math.abs(velocityPx) > FLICK_VELOCITY_THRESHOLD) {
			const dir = velocityPx > 0 ? 1 : -1; // positive vx = dragging right = pan decreasing
			// Find adjacent snap point in that direction
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

		// Slow drag → snap to nearest by position
		return nearestSnapPoint(current, points);
	}

	/** Begin easing vertical position to a target stop */
	function beginVerticalAnimation(targetIndex: number): void {
		animStartT = verticalT;
		animTargetT = verticalStops[targetIndex];
		animElapsed = 0;
		// Scale duration by distance for consistent perceived speed
		const distance = Math.abs(animTargetT - animStartT);
		const maxGap = Math.max(
			...verticalStops.map((s, i) => (i < verticalStops.length - 1 ? verticalStops[i + 1] - s : 0)),
		);
		animDuration = ANIMATE_DURATION * clamp(distance / (maxGap || 0.5), 0.3, 1);
		state = State.ANIMATING;
	}

	/** Begin easing a row's pan to a target */
	function beginPanAnimation(row: number, target: number): void {
		panAnimating[row] = true;
		panAnimStart[row] = panByRow[row];
		panAnimTarget[row] = target;
		panAnimElapsed[row] = 0;
	}

	function setVerticalWithRubberBand(raw: number): void {
		if (raw < 0) {
			verticalT = rubberBand(raw, 1);
		} else if (raw > 1) {
			verticalT = 1 + rubberBand(raw - 1, 1);
		} else {
			verticalT = raw;
		}
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

	function applyPanDelta(panDelta: number): void {
		const clamped = clamp(verticalT, 0, 1);
		const scaled = clamped * (numRows - 1);
		const index = Math.floor(scaled);
		const nextIndex = Math.min(index + 1, numRows - 1);

		if (index === nextIndex) {
			panByRow[index] = clamp(panByRow[index] + panDelta, -panLimit, panLimit);
			return;
		}

		const secondaryWeight = scaled - index;
		const primaryWeight = 1 - secondaryWeight;
		const norm = primaryWeight * primaryWeight + secondaryWeight * secondaryWeight;
		const scale = norm > 0 ? 1 / norm : 1;

		panByRow[index] = clamp(
			panByRow[index] + panDelta * primaryWeight * scale,
			-panLimit,
			panLimit,
		);
		panByRow[nextIndex] = clamp(
			panByRow[nextIndex] + panDelta * secondaryWeight * scale,
			-panLimit,
			panLimit,
		);
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

	/** Record origin snap points for all rows at gesture start */
	function captureOrigins(): void {
		dragOriginStop = nearestStopIndex(verticalT);
		for (let i = 0; i < numRows; i++) {
			const points = panSnapPoints[i];
			panOriginSnap[i] = points && points.length > 0 ? nearestSnapPoint(panByRow[i], points) : 0;
		}
	}

	/** Animate all pan rows to nearest snap and vertical to nearest stop */
	function settleAll(): void {
		const targetIdx = nearestStopIndex(verticalT);
		beginVerticalAnimation(targetIdx);
		for (let i = 0; i < numRows; i++) {
			const points = panSnapPoints[i];
			if (points && points.length > 0) {
				beginPanAnimation(i, nearestSnapPoint(panByRow[i], points));
			}
		}
	}

	// ── Pointer handlers ──

	function onPointerDown(e: PointerEvent): void {
		if (e.button !== 0 || activePointerId !== null) return;

		// Interrupt any ongoing animation — grab at current position
		if (state === State.ANIMATING) {
			// Snap to current animated position (already set by tick)
		}
		stopAllAnimations();

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
	}

	function onPointerMove(e: PointerEvent): void {
		if (activePointerId !== e.pointerId) return;
		if (state !== State.TRACKING && state !== State.DRAGGING) return;

		const dx = e.clientX - pointerDownX;
		const dy = e.clientY - pointerDownY;
		const dist = Math.sqrt(dx * dx + dy * dy);

		if (state === State.TRACKING) {
			if (dist < DIRECTION_LOCK_THRESHOLD) return;
			directionLocked = Math.abs(dy) >= Math.abs(dx) ? "v" : "h";
			state = State.DRAGGING;
		}

		pointerSamples.push({ x: e.clientX, y: e.clientY, t: performance.now() });
		if (pointerSamples.length > 20) pointerSamples.shift();

		const moveDx = e.clientX - pointerLastX;
		const moveDy = e.clientY - pointerLastY;
		pointerLastX = e.clientX;
		pointerLastY = e.clientY;

		if (directionLocked === "v") {
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
		const lockedDir = directionLocked;
		canvas.releasePointerCapture?.(e.pointerId);

		if (state === State.TRACKING) {
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

		// ── Commitment at release ──
		const vel = estimateVelocity(pointerSamples);
		directionLocked = null;
		pointerSamples.length = 0;

		if (prefersReducedMotion) {
			verticalT = clamp(verticalT, 0, 1);
			verticalT = verticalStops[nearestStopIndex(verticalT)];
			for (let i = 0; i < numRows; i++) {
				const points = panSnapPoints[i];
				if (points && points.length > 0) {
					panByRow[i] = nearestSnapPoint(panByRow[i], points);
				}
			}
			state = State.IDLE;
			inputDirty = true;
			return;
		}

		if (lockedDir === "v") {
			// Choose target based on velocity + position, animate directly there
			const targetIdx = chooseVerticalTarget(vel.vy);
			beginVerticalAnimation(targetIdx);
			// Also settle any displaced pans
			for (let i = 0; i < numRows; i++) {
				const points = panSnapPoints[i];
				if (points && points.length > 0) {
					beginPanAnimation(i, nearestSnapPoint(panByRow[i], points));
				}
			}
		} else if (lockedDir === "h") {
			// Choose pan target based on velocity + position
			for (let i = 0; i < numRows; i++) {
				const target = choosePanTarget(i, -vel.vx);
				if (target !== null) {
					beginPanAnimation(i, target);
				}
			}
			// Also snap vertically
			const targetIdx = nearestStopIndex(verticalT);
			beginVerticalAnimation(targetIdx);
		} else {
			settleAll();
		}
	}

	function onPointerCancel(e: PointerEvent): void {
		if (activePointerId !== e.pointerId) return;
		activePointerId = null;
		canvas.releasePointerCapture?.(e.pointerId);
		clearPointerTracking();
		pendingTap = null;
		settleAll();
	}

	function cancelActiveGesture(): void {
		if (activePointerId === null) return;
		clearPointerTracking();
		pendingTap = null;
		settleAll();
	}

	// ── Wheel handler ──
	// Wheel = discrete paging, not smooth scroll. Each "notch" pages one stop.

	function onWheel(e: WheelEvent): void {
		e.preventDefault();

		const now = performance.now();
		const rawY = normalizeWheelDelta(e.deltaY, e.deltaMode);
		const rawX = normalizeWheelDelta(e.deltaX, e.deltaMode);

		// Axis locking — trackpads send both axes simultaneously, pick the dominant one
		if (wheelAxisLock && now - wheelAxisLockTime > WHEEL_AXIS_LOCK_MS) {
			wheelAxisLock = null;
		}
		if (!wheelAxisLock && (Math.abs(rawX) > 1 || Math.abs(rawY) > 1)) {
			wheelAxisLock = Math.abs(rawY) >= Math.abs(rawX) ? "v" : "h";
			wheelAxisLockTime = now;
			// Reset the other axis accumulator when switching
			if (wheelAxisLock === "v") wheelAccumX = 0;
			else wheelAccumY = 0;
		}

		const deltaY = wheelAxisLock === "h" ? 0 : rawY;
		const deltaX = wheelAxisLock === "v" ? 0 : rawX;

		// Vertical paging
		if (deltaY !== 0) {
			wheelAccumY += deltaY;

			if (
				Math.abs(wheelAccumY) >= WHEEL_PAGE_THRESHOLD &&
				now - lastWheelPageTimeY >= WHEEL_COOLDOWN_MS
			) {
				const currentIdx =
					state === State.ANIMATING ? nearestStopIndex(animTargetT) : nearestStopIndex(verticalT);
				const dir: -1 | 1 = wheelAccumY > 0 ? 1 : -1;
				const targetIdx = adjacentStopIndex(currentIdx, dir);

				if (targetIdx !== currentIdx || state !== State.ANIMATING) {
					beginVerticalAnimation(targetIdx);
				}

				wheelAccumY = 0;
				lastWheelPageTimeY = now;
			}
		}

		// Horizontal paging
		if (deltaX !== 0) {
			wheelAccumX += deltaX;

			if (
				Math.abs(wheelAccumX) >= WHEEL_PAGE_THRESHOLD &&
				now - lastWheelPageTimeX >= WHEEL_COOLDOWN_MS
			) {
				const currentStopIdx =
					state === State.ANIMATING ? nearestStopIndex(animTargetT) : nearestStopIndex(verticalT);

				for (let i = 0; i < numRows; i++) {
					const points = panSnapPoints[i];
					if (!points || points.length <= 1) continue;

					// Only page the row we're currently on (or adjacent)
					if (Math.abs(i - currentStopIdx) > 0.6) continue;

					const currentSnap = panAnimating[i]
						? panAnimTarget[i]
						: nearestSnapPoint(panByRow[i], points);
					const dir = wheelAccumX > 0 ? -1 : 1;

					// Find adjacent snap in direction
					let bestTarget = currentSnap;
					let bestDist = Number.POSITIVE_INFINITY;
					for (const p of points) {
						const diff = p - currentSnap;
						if (dir > 0 && diff > 0.01 && diff < bestDist) {
							bestTarget = p;
							bestDist = diff;
						} else if (dir < 0 && diff < -0.01 && Math.abs(diff) < bestDist) {
							bestTarget = p;
							bestDist = Math.abs(diff);
						}
					}

					if (bestTarget !== currentSnap) {
						beginPanAnimation(i, bestTarget);
					}
				}

				wheelAccumX = 0;
				lastWheelPageTimeX = now;
			}
		}

		inputDirty = true;
	}

	// ── Animation tick ──

	function tick(dt: number): boolean {
		const hadInput = inputDirty;
		inputDirty = false;

		let changed = hadInput;

		// Vertical animation (ease-out to target)
		if (state === State.ANIMATING) {
			animElapsed += dt;
			const progress = clamp(animElapsed / animDuration, 0, 1);
			const eased = easeOut(progress);

			verticalT = lerp(animStartT, animTargetT, eased);
			changed = true;

			if (progress >= 1) {
				verticalT = animTargetT;
				state = State.IDLE;
			}
		}

		// Pan animations (independent per row)
		for (let i = 0; i < numRows; i++) {
			if (!panAnimating[i]) continue;

			panAnimElapsed[i] += dt;
			const progress = clamp(panAnimElapsed[i] / ANIMATE_DURATION, 0, 1);
			const eased = easeOut(progress);

			panByRow[i] = lerp(panAnimStart[i], panAnimTarget[i], eased);
			changed = true;

			if (progress >= 1) {
				panByRow[i] = panAnimTarget[i];
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

	function resetTo(t: number): void {
		verticalT = t;
		state = State.IDLE;
		stopAllAnimations();
		clearPointerTracking();
		pendingTap = null;
		inputDirty = false;
		wheelAccumY = 0;
		wheelAccumX = 0;
		wheelAxisLock = null;
		for (let i = 0; i < numRows; i++) {
			panByRow[i] = 0;
		}
	}

	function dispose(): void {
		state = State.IDLE;
		stopAllAnimations();
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
