import {
	Color,
	FogExp2,
	Group,
	type Object3D,
	Scene,
	Vector2,
	Vector3,
	WebGLRenderer,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import {
	animateBookClose,
	animateBookLift,
	animateFrameClose,
	animateFrameReveal,
	animateLaptopClose,
	animateLaptopOpen,
	animateNotebookClose,
	animateNotebookOpen,
	animateShelfPresent,
	animateShelfReset,
	animateSpin,
	animateWobble,
	disposeAnimations,
	easeInOutCubic,
	tickAnimations,
} from "./animations";
import {
	animateIntro,
	animateMobileIntro,
	createCamera,
	DESKTOP_LOOK,
	DESKTOP_POS,
	idleFloat,
	lerpCameraPose,
	MOBILE_INTRO_START_POS,
	MOBILE_LOOK,
	MOBILE_POS,
} from "./camera";
import { createDesk } from "./desk";
import { disposeObjectResources } from "./disposal";
import { createDeskPhysicsController } from "./drag";
import { addHitbox } from "./hitbox";
import { type DeskInteraction, setupInteraction } from "./interaction";
import { createLabelController } from "./labels";
import {
	setupDeskLighting,
	setupRoomLighting,
	setupSceneLighting,
	setupShelfLighting,
} from "./lighting";
import { createBookStack } from "./objects/book-stack";
import { createCircuitBoard } from "./objects/circuit-board";
import { createDeskLamp, toggleLamp } from "./objects/desk-lamp";
import { createGuitarPick } from "./objects/guitar-pick";
import { attachLaptopEffects, createLaptop } from "./objects/laptop";
import { createMug } from "./objects/mug";
import { createNotebook } from "./objects/notebook";
import { createPen } from "./objects/pen";
import { createPhotoFrame } from "./objects/photo-frame";
import { type BookData, createShelfWall } from "./objects/shelf-wall";

export type { BookData };

const MOBILE_BREAKPOINT = 768;
const HOVER_SCALE = 1.05;
const HOVER_LERP = 0.16;
const CLICK_COOLDOWN_MS = 420;
const TRANSITION_DURATION = 1000;
const DESKTOP_TO_SHELF_TRANSITION_DURATION = 1800;
const MOBILE_SHELF_STOPS = [
	{ cameraY: 1.25, lookY: 0.95 },
	{ cameraY: MOBILE_POS.y, lookY: MOBILE_LOOK.y },
	{ cameraY: 4.02, lookY: 3.72 },
] as const;
const MOBILE_SHELF_SCROLL_SPEED = 0.0028;
const MOBILE_SHELF_DRAG_SPEED = 0.007;
const MOBILE_SHELF_LERP = 0.26;
const MOBILE_SHELF_PAN_WHEEL_SPEED = 0.0022;
const MOBILE_SHELF_PAN_DRAG_SPEED = 0.006;
const MOBILE_SHELF_PAN_LERP = 0.22;
const MOBILE_SHELF_PAN_LIMIT = 1;
const MOBILE_SHELF_PAN_SNAP_POINTS = [[0], [-0.78, 0.3], [0]] as const;
const MOBILE_SHELF_PAN_SNAP_THRESHOLD = 0.26;
const MOBILE_SHELF_PAN_SNAP_SETTLE = 0.22;
const MOBILE_SHELF_PAN_SNAP_DRAG = 0.1;
const MOBILE_SHELF_VISIBLE_ROW_RANGE = 0.34;
const MOBILE_TRANSITION_MID_POS = MOBILE_INTRO_START_POS.clone();
const MOBILE_TRANSITION_MID_LOOK = new Vector3(8.1, 2.2, 4.7);

// ─── Desk animation maps ─────────────────────────────────────────
const OPEN_ANIMATIONS: Record<string, (obj: Object3D) => Promise<void>> = {
	Blog: animateNotebookOpen,
	Projects: animateLaptopOpen,
	Reading: animateBookLift,
	Photos: animateFrameReveal,
};

const CLOSE_ANIMATIONS: Record<string, (obj: Object3D) => Promise<void>> = {
	Blog: animateNotebookClose,
	Projects: animateLaptopClose,
	Reading: animateBookClose,
	Photos: animateFrameClose,
};

// ─── Modal access ────────────────────────────────────────────────
interface DeskModal {
	open: (label: string, href: string) => void;
	close: () => void;
	onClose: (cb: () => void) => () => void;
}

function getModal(): DeskModal | null {
	if (typeof window !== "undefined" && "__contentModal" in window) {
		return (window as Window & { __contentModal: DeskModal }).__contentModal;
	}
	return null;
}

function trackEvent(event: string, props: Record<string, string>): void {
	const w = window as Window & {
		posthog?: { capture: (e: string, p: Record<string, string>) => void };
	};
	w.posthog?.capture(event, props);
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

function easeInOutSine(t: number): number {
	return -(Math.cos(Math.PI * t) - 1) / 2;
}

function sampleMobileShelfTrack(t: number): {
	cameraY: number;
	lookY: number;
	index: number;
	nextIndex: number;
	localT: number;
} {
	const clamped = clamp(t, 0, 1);
	const scaled = clamped * (MOBILE_SHELF_STOPS.length - 1);
	const index = Math.floor(scaled);
	const nextIndex = Math.min(index + 1, MOBILE_SHELF_STOPS.length - 1);
	const localT = scaled - index;
	const from = MOBILE_SHELF_STOPS[index];
	const to = MOBILE_SHELF_STOPS[nextIndex];

	return {
		cameraY: lerp(from.cameraY, to.cameraY, localT),
		lookY: lerp(from.lookY, to.lookY, localT),
		index,
		nextIndex,
		localT,
	};
}

// ─── Unified scene ───────────────────────────────────────────────
export function initUnifiedScene(
	canvas: HTMLCanvasElement,
	labelContainer: HTMLElement,
	initialMode: "desktop" | "mobile",
	books?: BookData[],
): { cleanup: () => void; transition: (target: "desktop" | "mobile") => Promise<void> } {
	const scene = new Scene();
	scene.background = new Color("#1e1e1e");
	scene.fog = new FogExp2(new Color("#1e1e1e"), 0.04);

	const isInitiallyMobile = initialMode === "mobile";

	const renderer = new WebGLRenderer({
		canvas,
		antialias: !isInitiallyMobile,
		powerPreference: isInitiallyMobile ? "low-power" : "high-performance",
	});

	function applyRenderSettings(mode: "desktop" | "mobile"): void {
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, mode === "mobile" ? 1.25 : 2));
		renderer.shadowMap.enabled = true;
	}

	function getCanvasSize(): { width: number; height: number } {
		const parentRect = canvas.parentElement?.getBoundingClientRect();
		const rect = canvas.getBoundingClientRect();
		const width = Math.max(
			1,
			Math.round(parentRect?.width || rect.width || canvas.clientWidth || window.innerWidth),
		);
		const height = Math.max(
			1,
			Math.round(parentRect?.height || rect.height || canvas.clientHeight || window.innerHeight),
		);
		return { width, height };
	}

	const initialSize = getCanvasSize();
	applyRenderSettings(initialMode);
	renderer.setSize(initialSize.width, initialSize.height, false);

	const camera = createCamera(initialSize.width / initialSize.height);
	const labelController = createLabelController(labelContainer);
	const deskPhysics = createDeskPhysicsController();

	// Post-processing — bloom for screen glow (desktop/transition)
	const composer = new EffectComposer(renderer);
	const renderPass = new RenderPass(scene, camera);
	composer.addPass(renderPass);
	const bloomPass = new UnrealBloomPass(
		new Vector2(initialSize.width, initialSize.height),
		0.6,
		0.8,
		0.7,
	);
	composer.addPass(bloomPass);

	// ─── Room group ──────────────────────────────────────────────
	const room = new Group();
	scene.add(room);

	// Scene-level lighting (direction-independent)
	setupSceneLighting(scene);
	setupRoomLighting(room);

	// ─── State ───────────────────────────────────────────────────
	let currentMode: "desktop" | "mobile" = initialMode;
	let transitioning = false;
	let dirty = true;
	let isDragging = false;
	let introComplete = false;
	let currentHover: DeskInteraction | null = null;
	let openObject: { label: string; object: Object3D } | null = null;
	let clickLockedUntil = 0;
	let mobileShelfTargetT = 0.5;
	let mobileShelfCurrentT = 0.5;
	const mobileShelfTargetPanByStop = MOBILE_SHELF_STOPS.map(() => 0);
	const mobileShelfCurrentPanByStop = MOBILE_SHELF_STOPS.map(() => 0);
	let mobilePointerId: number | null = null;
	let mobilePointerLastX = 0;
	let mobilePointerLastY = 0;
	let cleanupModalClose: (() => void) | null = null;
	let disposed = false;
	let pendingModalTimeout = 0;
	let transitionAnimationId = 0;
	let postTransitionRaf = 0;

	// Wall state — lazily created
	let deskCreated = false;
	let shelfCreated = false;
	let deskObjects: {
		notebook: Object3D;
		laptop: Object3D;
		bookStack: Object3D;
		photoFrame: Object3D;
		deskLamp: Object3D;
		mug: Object3D;
		pen: Object3D;
		interactiveObjects: Object3D[];
	} | null = null;
	let shelfData: ReturnType<typeof createShelfWall> | null = null;

	// Interaction & drag cleanup references
	let cleanupInteraction: (() => void) | null = null;
	let cleanupDrag: (() => void) | null = null;
	let cleanupMobileShelfControls: (() => void) | null = null;
	let lastCanvasWidth = initialSize.width;
	let lastCanvasHeight = initialSize.height;
	const microInteractions = new Map<Object3D, () => void>();

	function getMobileShelfResponsiveLayout(): {
		cameraX: number;
		lookX: number;
		cameraZRange: number;
		lookZRange: number;
	} {
		const narrowness = clamp((430 - lastCanvasWidth) / 150, 0, 1);
		return {
			cameraX: lerp(0, -0.95, narrowness),
			lookX: lerp(0, -0.22, narrowness),
			cameraZRange: lerp(0.4, 1.1, narrowness),
			lookZRange: lerp(0.65, 1.55, narrowness),
		};
	}

	function sampleMobileShelfPan(t: number, pans: readonly number[]): number {
		const sample = sampleMobileShelfTrack(t);
		if (sample.index === sample.nextIndex) return pans[sample.index] ?? 0;
		return lerp(pans[sample.index] ?? 0, pans[sample.nextIndex] ?? 0, sample.localT);
	}

	function applyMobileShelfPanDelta(t: number, panDelta: number): void {
		const sample = sampleMobileShelfTrack(t);
		const updateStop = (index: number, weight: number) => {
			mobileShelfTargetPanByStop[index] = clamp(
				mobileShelfTargetPanByStop[index] + panDelta * weight,
				-MOBILE_SHELF_PAN_LIMIT,
				MOBILE_SHELF_PAN_LIMIT,
			);
		};

		if (sample.index === sample.nextIndex) {
			updateStop(sample.index, 1);
			return;
		}

		updateStop(sample.index, 1 - sample.localT);
		updateStop(sample.nextIndex, sample.localT);
	}

	function applyMobileShelfPanSnap(t: number, strength: number): void {
		for (let i = 0; i < MOBILE_SHELF_PAN_SNAP_POINTS.length; i++) {
			const stopT = i / (MOBILE_SHELF_STOPS.length - 1);
			const rowDistance = Math.abs(t - stopT);
			if (rowDistance > MOBILE_SHELF_VISIBLE_ROW_RANGE) continue;

			const snapPoints = MOBILE_SHELF_PAN_SNAP_POINTS[i];
			let nearestSnap = snapPoints[0];
			let nearestSnapDistance = Math.abs(mobileShelfTargetPanByStop[i] - nearestSnap);

			for (let j = 1; j < snapPoints.length; j++) {
				const candidate = snapPoints[j];
				const candidateDistance = Math.abs(mobileShelfTargetPanByStop[i] - candidate);
				if (candidateDistance < nearestSnapDistance) {
					nearestSnap = candidate;
					nearestSnapDistance = candidateDistance;
				}
			}

			if (nearestSnapDistance > MOBILE_SHELF_PAN_SNAP_THRESHOLD) continue;

			const visibilityWeight = 1 - rowDistance / MOBILE_SHELF_VISIBLE_ROW_RANGE;
			mobileShelfTargetPanByStop[i] = lerp(
				mobileShelfTargetPanByStop[i],
				nearestSnap,
				strength * visibilityWeight,
			);

			if (nearestSnapDistance < 0.015) {
				mobileShelfTargetPanByStop[i] = nearestSnap;
			}
		}
	}

	function syncMobileShelfCamera(t: number): void {
		const sample = sampleMobileShelfTrack(t);
		const pan = sampleMobileShelfPan(t, mobileShelfCurrentPanByStop);
		const responsive = getMobileShelfResponsiveLayout();
		camera.position.set(
			MOBILE_POS.x + responsive.cameraX,
			sample.cameraY,
			MOBILE_POS.z + pan * responsive.cameraZRange,
		);
		camera.lookAt(
			MOBILE_LOOK.x + responsive.lookX,
			sample.lookY,
			MOBILE_LOOK.z + pan * responsive.lookZRange,
		);
	}

	function getMobilePose(t: number): { pos: Vector3; look: Vector3 } {
		const sample = sampleMobileShelfTrack(t);
		const pan = sampleMobileShelfPan(t, mobileShelfCurrentPanByStop);
		const responsive = getMobileShelfResponsiveLayout();
		return {
			pos: new Vector3(
				MOBILE_POS.x + responsive.cameraX,
				sample.cameraY,
				MOBILE_POS.z + pan * responsive.cameraZRange,
			),
			look: new Vector3(
				MOBILE_LOOK.x + responsive.lookX,
				sample.lookY,
				MOBILE_LOOK.z + pan * responsive.lookZRange,
			),
		};
	}

	function setupMobileShelfControls(): () => void {
		const previousTouchAction = canvas.style.touchAction;
		canvas.style.touchAction = "none";

		function onWheel(e: WheelEvent): void {
			if (currentMode !== "mobile" || transitioning || !introComplete) return;
			e.preventDefault();
			mobileShelfTargetT = clamp(mobileShelfTargetT - e.deltaY * MOBILE_SHELF_SCROLL_SPEED, 0, 1);
			if (Math.abs(e.deltaX) > 0.1) {
				applyMobileShelfPanDelta(mobileShelfCurrentT, -e.deltaX * MOBILE_SHELF_PAN_WHEEL_SPEED);
			}
			applyMobileShelfPanSnap(mobileShelfCurrentT, MOBILE_SHELF_PAN_SNAP_SETTLE);
			dirty = true;
		}

		function onPointerDown(e: PointerEvent): void {
			if (currentMode !== "mobile" || transitioning || !introComplete) return;
			mobilePointerId = e.pointerId;
			mobilePointerLastX = e.clientX;
			mobilePointerLastY = e.clientY;
			canvas.setPointerCapture?.(e.pointerId);
		}

		function onPointerMove(e: PointerEvent): void {
			if (currentMode !== "mobile" || mobilePointerId !== e.pointerId) return;
			const deltaX = e.clientX - mobilePointerLastX;
			const deltaY = e.clientY - mobilePointerLastY;
			mobilePointerLastX = e.clientX;
			mobilePointerLastY = e.clientY;
			mobileShelfTargetT = clamp(mobileShelfTargetT + deltaY * MOBILE_SHELF_DRAG_SPEED, 0, 1);
			if (Math.abs(deltaX) > 0.1) {
				applyMobileShelfPanDelta(mobileShelfCurrentT, -deltaX * MOBILE_SHELF_PAN_DRAG_SPEED);
			}
			applyMobileShelfPanSnap(mobileShelfCurrentT, MOBILE_SHELF_PAN_SNAP_DRAG);
			dirty = true;
		}

		function releasePointer(e?: PointerEvent): void {
			if (!e || mobilePointerId === e.pointerId) {
				if (e) canvas.releasePointerCapture?.(e.pointerId);
				mobilePointerId = null;
				mobilePointerLastX = 0;
			}
		}

		canvas.addEventListener("wheel", onWheel, { passive: false });
		canvas.addEventListener("pointerdown", onPointerDown);
		canvas.addEventListener("pointermove", onPointerMove);
		canvas.addEventListener("pointerup", releasePointer);
		canvas.addEventListener("pointercancel", releasePointer);

		return () => {
			canvas.style.touchAction = previousTouchAction;
			canvas.removeEventListener("wheel", onWheel);
			canvas.removeEventListener("pointerdown", onPointerDown);
			canvas.removeEventListener("pointermove", onPointerMove);
			canvas.removeEventListener("pointerup", releasePointer);
			canvas.removeEventListener("pointercancel", releasePointer);
			mobilePointerId = null;
			mobilePointerLastX = 0;
		};
	}

	// ─── Create desk content ─────────────────────────────────────
	function createDeskContent(): void {
		if (deskCreated) return;
		deskCreated = true;

		setupDeskLighting(room);

		const desk = createDesk();
		room.add(desk);

		const deskLamp = createDeskLamp();
		room.add(deskLamp);

		const notebook = createNotebook();
		const laptop = createLaptop();
		const bookStack = createBookStack(books);
		const photoFrame = createPhotoFrame();
		room.add(notebook);
		room.add(laptop);
		room.add(bookStack);
		room.add(photoFrame);

		const mug = createMug();
		const pen = createPen();
		room.add(mug);
		room.add(pen);

		if (window.innerWidth >= MOBILE_BREAKPOINT) {
			room.add(createGuitarPick());
			room.add(createCircuitBoard());
		}

		addHitbox(notebook, 0.1);
		addHitbox(laptop, 0.1);
		addHitbox(bookStack, 0.1);
		addHitbox(photoFrame, 0.15);
		addHitbox(deskLamp, 0.05);

		deskPhysics.addStaticObstacle(notebook, 0.5);
		deskPhysics.addStaticObstacle(laptop, 0.6);
		deskPhysics.addStaticObstacle(bookStack, 0.45);
		deskPhysics.addStaticObstacle(deskLamp, 0.2);

		attachLaptopEffects(laptop);

		microInteractions.set(deskLamp, () => toggleLamp(deskLamp));
		microInteractions.set(mug, () => animateWobble(mug));
		microInteractions.set(pen, () => animateSpin(pen));

		deskObjects = {
			notebook,
			laptop,
			bookStack,
			photoFrame,
			deskLamp,
			mug,
			pen,
			interactiveObjects: [notebook, laptop, bookStack, photoFrame, deskLamp],
		};
	}

	// ─── Create shelf content ────────────────────────────────────
	function createShelfContent(): void {
		if (shelfCreated) return;
		shelfCreated = true;

		setupShelfLighting(room);
		shelfData = createShelfWall(books);
		room.add(shelfData.wall);
	}

	// ─── Visibility helpers ──────────────────────────────────────
	function setDeskVisible(visible: boolean): void {
		if (!deskObjects) return;
		for (const obj of deskObjects.interactiveObjects) obj.visible = visible;
		deskObjects.mug.visible = visible;
		deskObjects.pen.visible = visible;
		// Also set desk geometry and lamp visible
		room.traverse((child) => {
			if (child.userData?.shelfWall) return; // skip shelf
			if (child === room) return;
			// Only hide direct desk children, not the shelf wall group
			if (child.parent === room && !child.userData?.shelfWall) {
				child.visible = visible;
			}
		});
	}

	function setShelfVisible(visible: boolean): void {
		if (shelfData) shelfData.wall.visible = visible;
	}

	// ─── Setup interactions for current mode ─────────────────────
	function setupModeInteractions(): void {
		// Cleanup previous
		if (cleanupInteraction) {
			cleanupInteraction();
			cleanupInteraction = null;
		}
		if (cleanupDrag) {
			cleanupDrag();
			cleanupDrag = null;
		}
		if (cleanupMobileShelfControls) {
			cleanupMobileShelfControls();
			cleanupMobileShelfControls = null;
		}
		cleanupModalClose?.();
		cleanupModalClose = null;
		currentHover = null;
		openObject = null;
		labelController.update(null, camera, canvas);

		if (currentMode === "desktop" && deskObjects) {
			cleanupDrag = deskPhysics.setupDrag(
				canvas,
				camera,
				scene,
				(dragging) => {
					isDragging = dragging;
					dirty = true;
				},
				() => {
					dirty = true;
				},
			);

			cleanupInteraction = setupInteraction(
				canvas,
				camera,
				scene,
				(interaction) => {
					if (isDragging) return;
					currentHover = interaction;
					dirty = true;
				},
				(interaction) => {
					if (isDragging || !introComplete) return;
					if (performance.now() < clickLockedUntil) return;

					if (!interaction.href) {
						const handler = microInteractions.get(interaction.object);
						if (handler) {
							clickLockedUntil = performance.now() + 200;
							handler();
							dirty = true;
						}
						return;
					}

					const { href, label, object } = interaction as {
						href: string;
						label: string;
						object: Object3D;
					};
					if (openObject?.label === label) return;
					clickLockedUntil = performance.now() + CLICK_COOLDOWN_MS;

					if (openObject) {
						CLOSE_ANIMATIONS[openObject.label]?.(openObject.object);
					}
					openObject = { label, object };
					OPEN_ANIMATIONS[label]?.(object);

					if (pendingModalTimeout) window.clearTimeout(pendingModalTimeout);
					pendingModalTimeout = window.setTimeout(() => {
						pendingModalTimeout = 0;
						if (disposed) return;
						const modal = getModal();
						if (modal) modal.open(label, href);
						else window.location.href = href;
					}, 350);

					trackEvent("desk_object_click", { label, href });
				},
			);
		} else if (currentMode === "mobile" && shelfData) {
			cleanupMobileShelfControls = setupMobileShelfControls();
			const shelf = shelfData; // capture for closure narrowing
			cleanupInteraction = setupInteraction(
				canvas,
				camera,
				scene,
				() => {
					dirty = true;
				},
				(interaction) => {
					if (!introComplete || transitioning) return;
					if (!interaction.href || !interaction.label) return;
					if (openObject?.label === interaction.label) return;
					if (performance.now() < clickLockedUntil) return;
					clickLockedUntil = performance.now() + CLICK_COOLDOWN_MS;

					// Reset previous shelf item
					if (openObject) {
						const prevIdx = shelf.tapTargets.indexOf(openObject.object);
						if (prevIdx >= 0) animateShelfReset(shelf.shelfItems[prevIdx]);
					}

					const idx = shelf.tapTargets.indexOf(interaction.object);
					if (idx < 0) return;
					const { label, href } = interaction as { label: string; href: string };

					openObject = { label: interaction.label, object: interaction.object };
					const activeSelection = openObject;
					void animateShelfPresent(shelf.shelfItems[idx]).then(() => {
						if (openObject !== activeSelection) return;
						const modal = getModal();
						if (modal) modal.open(label, href);
						else window.location.href = href;
					});

					dirty = true;

					trackEvent("shelf_item_tap", { label, href });
				},
				{ enableHover: false },
			);
		}

		// Modal close handler
		const modal = getModal();
		cleanupModalClose =
			modal?.onClose(() => {
				if (!openObject) return;
				if (currentMode === "desktop") {
					CLOSE_ANIMATIONS[openObject.label]?.(openObject.object);
				} else if (shelfData) {
					const idx = shelfData.tapTargets.indexOf(openObject.object);
					if (idx >= 0) animateShelfReset(shelfData.shelfItems[idx]);
				}
				openObject = null;
				dirty = true;
			}) ?? null;
	}

	// ─── Initial setup ───────────────────────────────────────────
	if (initialMode === "desktop") {
		createDeskContent();
		room.rotation.y = 0;
		camera.position.copy(DESKTOP_POS);
		camera.lookAt(DESKTOP_LOOK);
	} else {
		createShelfContent();
		room.rotation.y = 0;
		syncMobileShelfCamera(mobileShelfCurrentT);
	}

	setupModeInteractions();

	// ─── Render loop ─────────────────────────────────────────────
	const startTime = performance.now();
	let animationId: number;
	let lastFrame = 0;
	let targetInterval = isInitiallyMobile ? 1000 / 60 : 0;

	function render(now: number): void {
		animationId = requestAnimationFrame(render);

		if (!transitioning && targetInterval > 0 && now - lastFrame < targetInterval) return;
		lastFrame = now;

		const animating = tickAnimations(now);
		const physicsActive = currentMode === "desktop" ? deskPhysics.tick(1 / 60) : false;
		if (animating || physicsActive) dirty = true;

		if (!introComplete) {
			if (currentMode === "desktop") {
				introComplete = animateIntro(camera, startTime, now);
			} else {
				introComplete = animateMobileIntro(camera, startTime, now);
				if (introComplete) syncMobileShelfCamera(mobileShelfCurrentT);
			}
			if (currentMode === "desktop") {
				composer.render();
			} else {
				renderer.render(scene, camera);
			}
			return;
		}

		// Desktop idle float
		if (currentMode === "desktop" && !transitioning) {
			if (idleFloat(camera, now)) dirty = true;
		}

		if (currentMode === "mobile" && !transitioning) {
			let cameraChanged = false;
			if (mobilePointerId === null) {
				applyMobileShelfPanSnap(mobileShelfCurrentT, MOBILE_SHELF_PAN_SNAP_SETTLE);
			}
			const delta = mobileShelfTargetT - mobileShelfCurrentT;
			if (Math.abs(delta) > 0.0005) {
				mobileShelfCurrentT += delta * MOBILE_SHELF_LERP;
				cameraChanged = true;
			} else if (Math.abs(delta) > 0) {
				mobileShelfCurrentT = mobileShelfTargetT;
				cameraChanged = true;
			}

			for (let i = 0; i < mobileShelfCurrentPanByStop.length; i++) {
				const panDelta = mobileShelfTargetPanByStop[i] - mobileShelfCurrentPanByStop[i];
				if (Math.abs(panDelta) > 0.0005) {
					mobileShelfCurrentPanByStop[i] += panDelta * MOBILE_SHELF_PAN_LERP;
					cameraChanged = true;
				} else if (Math.abs(panDelta) > 0) {
					mobileShelfCurrentPanByStop[i] = mobileShelfTargetPanByStop[i];
					cameraChanged = true;
				}
			}

			if (cameraChanged) {
				syncMobileShelfCamera(mobileShelfCurrentT);
				dirty = true;
			}
		}

		// Hover scale lerp (desktop only)
		if (currentMode === "desktop" && deskObjects && !transitioning) {
			for (const obj of deskObjects.interactiveObjects) {
				const target = currentHover?.object === obj ? HOVER_SCALE : 1;
				const delta = target - obj.scale.x;
				if (Math.abs(delta) > 0.001) {
					obj.scale.setScalar(obj.scale.x + delta * HOVER_LERP);
					dirty = true;
				}
			}
		}

		// Update labels (desktop only, not during transition)
		if (currentMode === "desktop" && !transitioning) {
			labelController.update(currentHover, camera, canvas);
		} else {
			labelController.update(null, camera, canvas);
		}

		if (dirty || transitioning) {
			if (currentMode === "desktop" || transitioning) {
				composer.render();
			} else {
				renderer.render(scene, camera);
			}
			dirty = false;
		}
	}

	animationId = requestAnimationFrame(render);

	// ─── Resize handler ──────────────────────────────────────────
	let resizeFrame = 0;

	function handleResize(): void {
		const { width, height } = getCanvasSize();
		if (width === lastCanvasWidth && height === lastCanvasHeight) return;
		lastCanvasWidth = width;
		lastCanvasHeight = height;

		applyRenderSettings(currentMode);
		renderer.setSize(width, height, false);
		composer.setSize(width, height);
		bloomPass.resolution.set(width, height);
		camera.aspect = width / height;
		camera.updateProjectionMatrix();
		if (currentMode === "mobile" && !transitioning) syncMobileShelfCamera(mobileShelfCurrentT);
		dirty = true;
	}

	function scheduleResize(): void {
		if (resizeFrame) return;
		resizeFrame = requestAnimationFrame(() => {
			resizeFrame = 0;
			if (disposed) return;
			handleResize();
		});
	}

	const resizeObserver =
		typeof ResizeObserver !== "undefined"
			? new ResizeObserver(() => {
					scheduleResize();
				})
			: null;
	if (canvas.parentElement) resizeObserver?.observe(canvas.parentElement);
	else resizeObserver?.observe(canvas);

	// ─── Transition ──────────────────────────────────────────────
	let transitionPromise: Promise<void> | null = null;

	async function transition(target: "desktop" | "mobile"): Promise<void> {
		if (target === currentMode) return;

		// If already transitioning, wait for it then try again
		if (transitionPromise) {
			await transitionPromise;
			if (target === currentMode) return;
		}

		transitionPromise = doTransition(target);
		await transitionPromise;
		transitionPromise = null;
	}

	async function doTransition(target: "desktop" | "mobile"): Promise<void> {
		transitioning = true;
		introComplete = true; // ensure intro is done

		// Cleanup current interactions
		if (cleanupInteraction) {
			cleanupInteraction();
			cleanupInteraction = null;
		}
		if (cleanupDrag) {
			cleanupDrag();
			cleanupDrag = null;
		}
		if (cleanupMobileShelfControls) {
			cleanupMobileShelfControls();
			cleanupMobileShelfControls = null;
		}
		labelController.update(null, camera, canvas);
		currentHover = null;

		// Close any open object
		if (openObject) {
			if (currentMode === "desktop") {
				CLOSE_ANIMATIONS[openObject.label]?.(openObject.object);
			} else if (shelfData) {
				const idx = shelfData.tapTargets.indexOf(openObject.object);
				if (idx >= 0) animateShelfReset(shelfData.shelfItems[idx]);
			}
			openObject = null;
		}

		// Lazy-create target wall
		if (target === "desktop") createDeskContent();
		else createShelfContent();

		// Make both walls visible during transition
		setDeskVisible(true);
		setShelfVisible(true);

		// Enable bloom and shadows during transition
		renderer.shadowMap.enabled = true;
		targetInterval = 0; // Full framerate during transition

		// Determine rotation and camera poses
		const fromRotY = room.rotation.y;
		const toRotY = 0;
		const fromMobilePose = getMobilePose(mobileShelfCurrentT);
		const toMobilePose = getMobilePose(0.5);
		const fromPos =
			currentMode === "desktop" ? camera.position.clone() : fromMobilePose.pos.clone();
		const toPos = target === "desktop" ? DESKTOP_POS.clone() : toMobilePose.pos.clone();
		const fromLook = currentMode === "desktop" ? DESKTOP_LOOK.clone() : fromMobilePose.look.clone();
		const toLook = target === "desktop" ? DESKTOP_LOOK.clone() : toMobilePose.look.clone();

		// Animate transition
		await new Promise<void>((resolve) => {
			const transitionStart = performance.now();
			const transitionDuration =
				currentMode === "desktop" && target === "mobile"
					? DESKTOP_TO_SHELF_TRANSITION_DURATION
					: TRANSITION_DURATION;

			function tick(): void {
				if (disposed) {
					resolve();
					return;
				}

				const now = performance.now();
				const elapsed = now - transitionStart;
				const t = Math.min(elapsed / transitionDuration, 1);
				const eased =
					currentMode === "desktop" && target === "mobile" ? easeInOutSine(t) : easeInOutCubic(t);

				// Rotate room
				room.rotation.y = fromRotY + (toRotY - fromRotY) * eased;

				// Interpolate camera
				if (currentMode === "desktop" && target === "mobile") {
					if (eased < 0.5) {
						lerpCameraPose(
							camera,
							fromPos,
							MOBILE_TRANSITION_MID_POS,
							fromLook,
							MOBILE_TRANSITION_MID_LOOK,
							eased * 2,
						);
					} else {
						lerpCameraPose(
							camera,
							MOBILE_TRANSITION_MID_POS,
							toPos,
							MOBILE_TRANSITION_MID_LOOK,
							toLook,
							(eased - 0.5) * 2,
						);
					}
				} else {
					lerpCameraPose(camera, fromPos, toPos, fromLook, toLook, eased);
				}

				dirty = true;

				if (t < 1) {
					transitionAnimationId = requestAnimationFrame(tick);
				} else {
					transitionAnimationId = 0;
					resolve();
				}
			}

			transitionAnimationId = requestAnimationFrame(tick);
		});

		// Settle into target mode
		currentMode = target;
		room.rotation.y = toRotY;

		// Hide the wall we're not looking at
		if (target === "desktop") {
			setShelfVisible(false);
			applyRenderSettings("desktop");
			targetInterval = 0;
		} else {
			mobileShelfCurrentT = 0.5;
			mobileShelfTargetT = 0.5;
			syncMobileShelfCamera(mobileShelfCurrentT);
			postTransitionRaf = requestAnimationFrame(() => {
				postTransitionRaf = 0;
				if (disposed) return;
				if (currentMode === "mobile" && !transitioning) {
					syncMobileShelfCamera(mobileShelfCurrentT);
					dirty = true;
				}
			});
			setDeskVisible(false);
			applyRenderSettings("mobile");
			targetInterval = 1000 / 60;
		}

		transitioning = false;

		// Re-setup interactions for new mode
		setupModeInteractions();
		handleResize();
		dirty = true;
	}

	// ─── Cleanup ─────────────────────────────────────────────────
	function cleanup(): void {
		disposed = true;
		resizeObserver?.disconnect();
		cancelAnimationFrame(animationId);
		if (resizeFrame) cancelAnimationFrame(resizeFrame);
		if (transitionAnimationId) cancelAnimationFrame(transitionAnimationId);
		if (postTransitionRaf) cancelAnimationFrame(postTransitionRaf);
		if (pendingModalTimeout) window.clearTimeout(pendingModalTimeout);
		if (cleanupInteraction) cleanupInteraction();
		if (cleanupDrag) cleanupDrag();
		if (cleanupMobileShelfControls) cleanupMobileShelfControls();
		cleanupModalClose?.();
		labelController.dispose();
		disposeObjectResources(scene);

		disposeAnimations();
		deskPhysics.dispose();
		renderer.dispose();
	}

	return { cleanup, transition };
}
