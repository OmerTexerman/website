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

interface LinearStop {
	stopIndex: number;
	verticalT: number;
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
				verticalT: verticalStops[i],
				panTarget: points?.[0] ?? 0,
				row: i,
			});
		} else {
			for (const p of points) {
				sequence.push({ stopIndex: i, verticalT: verticalStops[i], panTarget: p, row: i });
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
const ANIMATE_DURATION = 0.35;
const RUBBER_BAND_FACTOR = 0.35;
const VELOCITY_WINDOW_MS = 100;
const WHEEL_LINE_PIXELS = 16;
const WHEEL_PAGE_THRESHOLD = 40;
const WHEEL_COOLDOWN_MS = 200;
const WHEEL_SETTLE_DELAY_MS = 150;
const WHEEL_CONTINUOUS_VERTICAL_SPEED = 0.0006;
const WHEEL_CONTINUOUS_PAN_SPEED = 0.0006;
const WHEEL_INERTIA_THRESHOLD = 2;
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
	const linearSequence = buildLinearSequence(config);
	let linearIndex = Math.floor(linearSequence.length / 2);

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
	let lastWheelPageTimeY = 0;
	let wheelAxisLock: "v" | "h" | null = null;
	let wheelGestureActive = false;
	let wheelSettleTimer = 0;

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

	function chooseVerticalTarget(velocityPx: number): number {
		const clamped = clamp(verticalT, 0, 1);
		if (Math.abs(velocityPx) > FLICK_VELOCITY_THRESHOLD) {
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

	function beginVerticalAnimation(targetIndex: number): boolean {
		const target = verticalStops[targetIndex];
		if (state === State.ANIMATING && Math.abs(animTargetT - target) < 0.0001) return false;
		if (state === State.IDLE && Math.abs(verticalT - target) < 0.0001) return false;

		animStartT = verticalT;
		animTargetT = target;
		animElapsed = 0;
		const maxGap = Math.max(
			...verticalStops.map((stop, index) =>
				index < verticalStops.length - 1 ? verticalStops[index + 1] - stop : 0,
			),
		);
		const distance = Math.abs(animTargetT - animStartT);
		animDuration = ANIMATE_DURATION * clamp(distance / (maxGap || 0.5), 0.3, 1);
		state = State.ANIMATING;
		return true;
	}

	function beginPanAnimation(row: number, target: number): boolean {
		if (Math.abs(panByRow[row] - target) < 0.0001) {
			panAnimating[row] = false;
			panByRow[row] = target;
			return false;
		}
		panAnimating[row] = true;
		panAnimStart[row] = panByRow[row];
		panAnimTarget[row] = target;
		panAnimElapsed[row] = 0;
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
		wheelGestureActive = false;
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
			changed = setVerticalWithRubberBand(rawT - moveDy * DRAG_VERTICAL_SPEED);
		} else if (directionLocked === "h") {
			changed = applyPanDelta(-moveDx * DRAG_PAN_SPEED);
		}
		return changed ? markChanged() : false;
	}

	function onPointerUp(e: PointerEvent): boolean {
		if (activePointerId !== e.pointerId) return false;
		activePointerId = null;
		const lockedDir = directionLocked;
		canvas.releasePointerCapture?.(e.pointerId);

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
			changed = beginVerticalAnimation(chooseVerticalTarget(vel.vy));
			for (let i = 0; i < numRows; i++) {
				const points = panSnapPoints[i];
				if (points && points.length > 0) {
					changed = beginPanAnimation(i, nearestSnapPoint(panByRow[i], points)) || changed;
				}
			}
		} else if (lockedDir === "h") {
			for (let i = 0; i < numRows; i++) {
				const target = choosePanTarget(i, -vel.vx);
				if (target !== null) {
					changed = beginPanAnimation(i, target) || changed;
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
		canvas.releasePointerCapture?.(e.pointerId);
		clearPointerTracking();
		pendingTap = null;
		return settleAll();
	}

	function cancelActiveGesture(): boolean {
		const hadWheel = wheelGestureActive;
		resetWheelState();
		if (activePointerId === null && !hadWheel) return false;
		clearPointerTracking();
		pendingTap = null;
		return settleAll();
	}

	function wheelGestureStart(): void {
		if (wheelGestureActive) return;
		wheelGestureActive = true;
		state = State.IDLE;
		stopAllAnimations();
		captureOrigins();
	}

	function wheelGestureEnd(): void {
		const wasContinuous = wheelGestureActive;
		wheelGestureActive = false;
		wheelAxisLock = null;
		wheelAccumY = 0;
		if (wasContinuous) {
			settleAll();
			inputDirty = true;
		}
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
		let bestIdx = 0;
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

	function onWheelContinuous(rawY: number, rawX: number): boolean {
		const magnitude = Math.hypot(rawY, rawX);

		// Skip tiny inertial events — don't let them delay the settle snap
		if (magnitude < WHEEL_INERTIA_THRESHOLD) {
			return false;
		}

		wheelGestureStart();

		const deltaY = wheelAxisLock === "h" ? 0 : rawY;
		// Only allow horizontal pan on rows that actually have multiple snap points
		const deltaX = wheelAxisLock === "v" || !hasHorizontalContent() ? 0 : rawX;
		let changed = false;

		if (deltaY !== 0) {
			const rawT = getRawVertical();
			changed = setVerticalWithRubberBand(rawT - deltaY * WHEEL_CONTINUOUS_VERTICAL_SPEED);
		}

		if (deltaX !== 0) {
			changed = applyPanDelta(-deltaX * WHEEL_CONTINUOUS_PAN_SPEED) || changed;
		}

		armWheelSettle();
		return changed;
	}

	function onWheel(e: WheelEvent): boolean {
		e.preventDefault();

		const now = performance.now();
		const rawY = normalizeWheelDelta(e.deltaY, e.deltaMode);
		const rawX = normalizeWheelDelta(e.deltaX, e.deltaMode);

		// deltaMode !== 0 means line or page units (discrete mouse wheel)
		// deltaMode === 0 with pixel values is trackpad/continuous input
		const discrete = e.deltaMode !== 0;

		if (discrete) {
			// Linear item navigation — no axis lock needed, vertical only
			const changed = onWheelDiscrete(rawY, now);
			return changed ? markChanged() : false;
		}

		// Continuous trackpad: apply axis lock
		if (!wheelAxisLock && (Math.abs(rawX) > 1 || Math.abs(rawY) > 1)) {
			wheelAxisLock = Math.abs(rawY) >= Math.abs(rawX) ? "v" : "h";
		}
		const changed = onWheelContinuous(rawY, rawX);
		return changed ? markChanged() : false;
	}

	function tick(dt: number): boolean {
		const hadInput = inputDirty;
		inputDirty = false;
		let changed = hadInput;

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
		resetTo,
		dispose,
	};
}
