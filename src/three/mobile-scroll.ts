import { clamp, lerp } from "./math-utils";

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
	/** Hard-reset position (used after transitions) */
	resetTo(t: number): void;
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
const ANIMATE_DURATION = 0.35;
const RUBBER_BAND_FACTOR = 0.35;
const VELOCITY_WINDOW_MS = 100;
const WHEEL_LINE_PIXELS = 16;
const WHEEL_PAGE_THRESHOLD = 40;
const WHEEL_COOLDOWN_MS = 200;
const WHEEL_AXIS_LOCK_MS = 150;
const DRAG_VERTICAL_SPEED = 0.003;
const DRAG_PAN_SPEED = 0.003;

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
		typeof window !== "undefined" &&
		window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
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
		const sample = samples[i];
		if (sample.t < cutoff) break;
		const t = (sample.t - last.t) / 1000;
		sumT += t;
		sumX += sample.x;
		sumY += sample.y;
		sumTT += t * t;
		sumTX += t * sample.x;
		sumTY += t * sample.y;
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
		const distance = Math.abs(value - points[i]);
		if (distance < bestDist) {
			best = points[i];
			bestDist = distance;
		}
	}
	return best;
}

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

export function createMobileScrollController(
	canvas: HTMLCanvasElement,
	config: MobileScrollConfig,
): MobileScrollController {
	const { verticalStops, panSnapPoints, panLimit, numRows } = config;

	let state: State = State.IDLE;
	let verticalT = 0.5;
	let dragOriginStop = 1;

	let animStartT = 0;
	let animTargetT = 0;
	let animElapsed = 0;
	let animDuration = ANIMATE_DURATION;

	const panByRow: number[] = Array.from({ length: numRows }, () => 0);
	const panOriginSnap: number[] = Array.from({ length: numRows }, () => 0);
	const panAnimating: boolean[] = Array.from({ length: numRows }, () => false);
	const panAnimStart: number[] = Array.from({ length: numRows }, () => 0);
	const panAnimTarget: number[] = Array.from({ length: numRows }, () => 0);
	const panAnimElapsed: number[] = Array.from({ length: numRows }, () => 0);

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
	let wheelAccumX = 0;
	let lastWheelPageTimeY = 0;
	let lastWheelPageTimeX = 0;
	let wheelAxisLock: "v" | "h" | null = null;
	let wheelAxisLockTime = 0;

	function nearestStopIndex(t: number): number {
		const clampedT = clamp(t, 0, 1);
		let bestIdx = 0;
		let bestDist = Math.abs(clampedT - verticalStops[0]);
		for (let i = 1; i < verticalStops.length; i++) {
			const distance = Math.abs(clampedT - verticalStops[i]);
			if (distance < bestDist) {
				bestIdx = i;
				bestDist = distance;
			}
		}
		return bestIdx;
	}

	function activeVerticalStopIndex(): number {
		return nearestStopIndex(state === State.ANIMATING ? animTargetT : verticalT);
	}

	function adjacentStopIndex(fromIndex: number, direction: -1 | 1): number {
		return clamp(fromIndex + direction, 0, verticalStops.length - 1);
	}

	function chooseVerticalTarget(velocityPx: number): number {
		const clampedT = clamp(verticalT, 0, 1);
		if (Math.abs(velocityPx) > FLICK_VELOCITY_THRESHOLD) {
			return adjacentStopIndex(dragOriginStop, velocityPx > 0 ? 1 : -1);
		}

		const originT = verticalStops[dragOriginStop];
		const displacement = clampedT - originT;

		if (displacement > 0 && dragOriginStop < verticalStops.length - 1) {
			const nextT = verticalStops[dragOriginStop + 1];
			const gap = nextT - originT;
			if (displacement / gap > POSITION_COMMIT_RATIO) return dragOriginStop + 1;
		} else if (displacement < 0 && dragOriginStop > 0) {
			const previousT = verticalStops[dragOriginStop - 1];
			const gap = originT - previousT;
			if (Math.abs(displacement) / gap > POSITION_COMMIT_RATIO) return dragOriginStop - 1;
		}

		return dragOriginStop;
	}

	function choosePanTarget(row: number, velocityPx: number): number | null {
		const points = panSnapPoints[row];
		if (!points || points.length === 0) return null;

		const originSnap = panOriginSnap[row];
		const currentPan = panByRow[row];

		if (Math.abs(velocityPx) > FLICK_VELOCITY_THRESHOLD) {
			const direction = velocityPx > 0 ? 1 : -1;
			let bestIdx = -1;
			let bestDist = Number.POSITIVE_INFINITY;

			for (let i = 0; i < points.length; i++) {
				const diff = points[i] - originSnap;
				if (direction < 0 && diff < -0.01 && Math.abs(diff) < bestDist) {
					bestIdx = i;
					bestDist = Math.abs(diff);
				} else if (direction > 0 && diff > 0.01 && Math.abs(diff) < bestDist) {
					bestIdx = i;
					bestDist = Math.abs(diff);
				}
			}

			return bestIdx >= 0 ? points[bestIdx] : nearestSnapPoint(currentPan, points);
		}

		return nearestSnapPoint(currentPan, points);
	}

	function beginVerticalAnimation(targetIndex: number): boolean {
		const targetT = verticalStops[targetIndex];
		const startT = verticalT;
		const distance = Math.abs(targetT - startT);
		if (distance <= 0.0001 && state !== State.ANIMATING) {
			verticalT = targetT;
			state = State.IDLE;
			return false;
		}

		animStartT = startT;
		animTargetT = targetT;
		animElapsed = 0;
		const maxGap = Math.max(
			...verticalStops.map((stop, index) =>
				index < verticalStops.length - 1 ? verticalStops[index + 1] - stop : 0,
			),
		);
		animDuration = ANIMATE_DURATION * clamp(distance / (maxGap || 0.5), 0.3, 1);
		state = State.ANIMATING;
		inputDirty = true;
		return true;
	}

	function beginPanAnimation(row: number, target: number): boolean {
		if (Math.abs(panByRow[row] - target) <= 0.0001 && !panAnimating[row]) {
			panByRow[row] = target;
			return false;
		}
		panAnimating[row] = true;
		panAnimStart[row] = panByRow[row];
		panAnimTarget[row] = target;
		panAnimElapsed[row] = 0;
		inputDirty = true;
		return true;
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
		const overscroll = verticalT - 1;
		const ratio = overscroll / RUBBER_BAND_FACTOR;
		if (ratio >= 1) return 3;
		return 1 - 0.5 * Math.log(1 - ratio);
	}

	function applyPanDelta(panDelta: number): void {
		const clampedT = clamp(verticalT, 0, 1);
		const scaled = clampedT * (numRows - 1);
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

	function captureOrigins(): void {
		dragOriginStop = nearestStopIndex(verticalT);
		for (let i = 0; i < numRows; i++) {
			const points = panSnapPoints[i];
			panOriginSnap[i] = points && points.length > 0 ? nearestSnapPoint(panByRow[i], points) : 0;
		}
	}

	function settlePans(): boolean {
		let changed = false;
		for (let i = 0; i < numRows; i++) {
			const points = panSnapPoints[i];
			if (!points || points.length === 0) continue;
			changed = beginPanAnimation(i, nearestSnapPoint(panByRow[i], points)) || changed;
		}
		return changed;
	}

	function settleAll(): boolean {
		const verticalChanged = beginVerticalAnimation(nearestStopIndex(verticalT));
		return settlePans() || verticalChanged;
	}

	function onPointerDown(e: PointerEvent): boolean {
		if (e.button !== 0 || activePointerId !== null) return false;
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
		return true;
	}

	function onPointerMove(e: PointerEvent): boolean {
		if (activePointerId !== e.pointerId) return false;
		if (state !== State.TRACKING && state !== State.DRAGGING) return false;

		const dx = e.clientX - pointerDownX;
		const dy = e.clientY - pointerDownY;
		const distance = Math.sqrt(dx * dx + dy * dy);

		if (state === State.TRACKING) {
			if (distance < DIRECTION_LOCK_THRESHOLD) return false;
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
			setVerticalWithRubberBand(getRawVertical() + moveDy * DRAG_VERTICAL_SPEED);
			inputDirty = true;
			return true;
		}

		if (directionLocked === "h") {
			applyPanDelta(-moveDx * DRAG_PAN_SPEED);
			inputDirty = true;
			return true;
		}

		return false;
	}

	function onPointerUp(e: PointerEvent): boolean {
		if (activePointerId !== e.pointerId) return false;
		activePointerId = null;
		const lockedDirection = directionLocked;
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
			return pendingTap !== null;
		}

		if (state !== State.DRAGGING) {
			directionLocked = null;
			pointerSamples.length = 0;
			state = State.IDLE;
			return false;
		}

		const velocity = estimateVelocity(pointerSamples);
		directionLocked = null;
		pointerSamples.length = 0;

		if (prefersReducedMotion()) {
			verticalT = verticalStops[nearestStopIndex(clamp(verticalT, 0, 1))];
			for (let i = 0; i < numRows; i++) {
				const points = panSnapPoints[i];
				if (points && points.length > 0) panByRow[i] = nearestSnapPoint(panByRow[i], points);
			}
			state = State.IDLE;
			inputDirty = true;
			return true;
		}

		if (lockedDirection === "v") {
			const changed = beginVerticalAnimation(chooseVerticalTarget(velocity.vy));
			return settlePans() || changed;
		}

		if (lockedDirection === "h") {
			let changed = false;
			for (let i = 0; i < numRows; i++) {
				const target = choosePanTarget(i, -velocity.vx);
				if (target !== null) changed = beginPanAnimation(i, target) || changed;
			}
			return beginVerticalAnimation(nearestStopIndex(verticalT)) || changed;
		}

		return settleAll();
	}

	function onPointerCancel(e: PointerEvent): boolean {
		if (activePointerId !== e.pointerId) return false;
		activePointerId = null;
		canvas.releasePointerCapture?.(e.pointerId);
		clearPointerTracking();
		pendingTap = null;
		return settleAll();
	}

	function cancelActiveGesture(): boolean {
		if (activePointerId === null) return false;
		clearPointerTracking();
		pendingTap = null;
		return settleAll();
	}

	function onWheel(e: WheelEvent): boolean {
		e.preventDefault();

		if (prefersReducedMotion()) {
			wheelAccumX = 0;
			wheelAccumY = 0;
		}

		const now = performance.now();
		const rawY = normalizeWheelDelta(e.deltaY, e.deltaMode);
		const rawX = normalizeWheelDelta(e.deltaX, e.deltaMode);

		if (wheelAxisLock && now - wheelAxisLockTime > WHEEL_AXIS_LOCK_MS) {
			wheelAxisLock = null;
		}
		if (!wheelAxisLock && (Math.abs(rawX) > 1 || Math.abs(rawY) > 1)) {
			wheelAxisLock = Math.abs(rawY) >= Math.abs(rawX) ? "v" : "h";
			if (wheelAxisLock === "v") wheelAccumX = 0;
			else wheelAccumY = 0;
		}
		if (wheelAxisLock) wheelAxisLockTime = now;

		const deltaY = wheelAxisLock === "h" ? 0 : rawY;
		const deltaX = wheelAxisLock === "v" ? 0 : rawX;

		let changed = false;

		if (deltaY !== 0) {
			wheelAccumY += deltaY;
			if (
				Math.abs(wheelAccumY) >= WHEEL_PAGE_THRESHOLD &&
				now - lastWheelPageTimeY >= WHEEL_COOLDOWN_MS
			) {
				const currentIdx = activeVerticalStopIndex();
				const direction: -1 | 1 = wheelAccumY > 0 ? -1 : 1;
				changed = beginVerticalAnimation(adjacentStopIndex(currentIdx, direction)) || changed;
				changed = settlePans() || changed;
				wheelAccumY = 0;
				lastWheelPageTimeY = now;
			}
		}

		if (deltaX !== 0) {
			wheelAccumX += deltaX;
			if (
				Math.abs(wheelAccumX) >= WHEEL_PAGE_THRESHOLD &&
				now - lastWheelPageTimeX >= WHEEL_COOLDOWN_MS
			) {
				const row = activeVerticalStopIndex();
				const points = panSnapPoints[row];
				if (points && points.length > 1) {
					const currentSnap = panAnimating[row]
						? panAnimTarget[row]
						: nearestSnapPoint(panByRow[row], points);
					const direction: -1 | 1 = wheelAccumX > 0 ? -1 : 1;
					let bestTarget = currentSnap;
					let bestDist = Number.POSITIVE_INFINITY;
					for (const point of points) {
						const diff = point - currentSnap;
						if (direction > 0 && diff > 0.01 && diff < bestDist) {
							bestTarget = point;
							bestDist = diff;
						} else if (direction < 0 && diff < -0.01 && Math.abs(diff) < bestDist) {
							bestTarget = point;
							bestDist = Math.abs(diff);
						}
					}
					changed = beginPanAnimation(row, bestTarget) || changed;
				}
				wheelAccumX = 0;
				lastWheelPageTimeX = now;
			}
		}

		return changed;
	}

	function tick(dt: number): boolean {
		const hadInput = inputDirty;
		inputDirty = false;
		let changed = hadInput;

		if (state === State.ANIMATING) {
			animElapsed += dt;
			const progress = clamp(animElapsed / animDuration, 0, 1);
			verticalT = lerp(animStartT, animTargetT, easeOut(progress));
			changed = true;
			if (progress >= 1) {
				verticalT = animTargetT;
				state = State.IDLE;
			}
		}

		for (let i = 0; i < numRows; i++) {
			if (!panAnimating[i]) continue;
			panAnimElapsed[i] += dt;
			const progress = clamp(panAnimElapsed[i] / ANIMATE_DURATION, 0, 1);
			panByRow[i] = lerp(panAnimStart[i], panAnimTarget[i], easeOut(progress));
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
