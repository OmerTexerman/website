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
import { getSectionById, type SiteSection } from "../config";
import type { ShelfBook } from "../content/types";
import { getContentModal } from "../modal/api";
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
	MOBILE_LOOK,
	MOBILE_POS,
} from "./camera";
import { DARK } from "./colors";
import {
	CLICK_COOLDOWN_MS,
	DESKTOP_TO_SHELF_TRANSITION_DURATION,
	HOVER_LERP,
	HOVER_SCALE,
	MOBILE_BREAKPOINT,
	TRANSITION_DURATION,
} from "./constants";
import { createDesk } from "./desk";
import { disposeObjectResources } from "./disposal";
import { createDeskPhysicsController } from "./drag";
import { addHitbox } from "./hitbox";
import { createInteractionPicker, type DeskInteraction, setupInteraction } from "./interaction";
import { createLabelController } from "./labels";
import {
	setupDeskLighting,
	setupRoomLighting,
	setupSceneLighting,
	setupShelfLighting,
} from "./lighting";
import { clamp, lerp } from "./math-utils";
import { createMobileScrollController, type MobileScrollController } from "./mobile-scroll";
import { createBookStack } from "./objects/book-stack";
import { createCircuitBoard } from "./objects/circuit-board";
import { createDeskLamp, toggleLamp } from "./objects/desk-lamp";
import { createGuitarPick } from "./objects/guitar-pick";
import { createLaptop } from "./objects/laptop";
import { createMug } from "./objects/mug";
import { createNotebook } from "./objects/notebook";
import { createPen } from "./objects/pen";
import { createPhotoFrame } from "./objects/photo-frame";
import { createShelfWall, type ShelfSceneEntry } from "./objects/shelf-wall";
import {
	MOBILE_SHELF_SCROLL,
	MOBILE_SHELF_STOPS,
	MOBILE_TRANSITION_MID_LOOK,
	MOBILE_TRANSITION_MID_POS,
} from "./shelf-layout";

interface DeskSectionEntity {
	kind: "section";
	section: SiteSection;
	root: Object3D;
	hitboxPadding: number;
	obstacleRadius?: number;
	hoverScale?: boolean;
	modalDelayMs: number;
	open: () => Promise<void>;
	close: () => Promise<void>;
}

interface DeskMicroEntity {
	kind: "micro";
	root: Object3D;
	hitboxPadding?: number;
	obstacleRadius?: number;
	hoverScale?: boolean;
	activate: () => void;
}

type DeskInteractiveEntity = DeskSectionEntity | DeskMicroEntity;

interface DeskSceneData {
	roots: Object3D[];
	interactiveEntityByRoot: Map<Object3D, DeskInteractiveEntity>;
	hoverTargets: Object3D[];
}

interface ShelfSceneData {
	wall: Group;
	entries: ShelfSceneEntry[];
	entryByTarget: Map<Object3D, ShelfSceneEntry>;
}

type OpenSelection =
	| {
			mode: "desktop";
			entity: DeskSectionEntity;
	  }
	| {
			mode: "mobile";
			entry: ShelfSceneEntry;
	  };

function trackEvent(event: string, props: Record<string, string>): void {
	const w = window as Window & {
		posthog?: { capture: (e: string, p: Record<string, string>) => void };
	};
	w.posthog?.capture(event, props);
}

function easeInOutSine(t: number): number {
	return -(Math.cos(Math.PI * t) - 1) / 2;
}

function sampleMobileShelfTrack(
	t: number,
	options?: { allowOverflow?: boolean },
): {
	cameraY: number;
	lookY: number;
	index: number;
	nextIndex: number;
	localT: number;
} {
	const maxIndex = MOBILE_SHELF_STOPS.length - 1;
	if (maxIndex <= 0) {
		const only = MOBILE_SHELF_STOPS[0];
		return {
			cameraY: only.cameraY,
			lookY: only.lookY,
			index: 0,
			nextIndex: 0,
			localT: 0,
		};
	}

	const scaled = (options?.allowOverflow ? t : clamp(t, 0, 1)) * maxIndex;
	let index = Math.floor(scaled);
	let nextIndex = Math.min(index + 1, maxIndex);
	let localT = scaled - index;

	if (scaled <= 0) {
		index = 0;
		nextIndex = 1;
		localT = scaled;
	} else if (scaled >= maxIndex) {
		index = maxIndex - 1;
		nextIndex = maxIndex;
		localT = scaled - index;
	}
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
	books?: ShelfBook[],
	options?: { skipIntro?: boolean },
): { cleanup: () => void; transition: (target: "desktop" | "mobile") => Promise<void> } {
	const scene = new Scene();
	scene.background = new Color(DARK);
	scene.fog = new FogExp2(new Color(DARK), 0.04);

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
	setupRoomLighting(room, isInitiallyMobile);

	// ─── State ───────────────────────────────────────────────────
	let currentMode: "desktop" | "mobile" = initialMode;
	let transitioning = false;
	let dirty = true;
	let isDragging = false;
	let introComplete = options?.skipIntro ?? false;
	let currentHover: DeskInteraction | null = null;
	let openSelection: OpenSelection | null = null;
	let clickLockedUntil = 0;
	let scrollController: MobileScrollController | null = null;
	let cleanupModalClose: (() => void) | null = null;
	let disposed = false;
	let contextLost = false;
	let pendingModalTimeout = 0;
	let transitionAnimationId = 0;
	let transitionResolve: (() => void) | null = null;
	let postTransitionRaf = 0;

	// Wall state — lazily created
	let deskCreated = false;
	let shelfCreated = false;
	let deskScene: DeskSceneData | null = null;
	let shelfScene: ShelfSceneData | null = null;

	// Interaction & drag cleanup references
	let cleanupInteraction: (() => void) | null = null;
	let cleanupDrag: (() => void) | null = null;
	let cleanupMobileShelfControls: (() => void) | null = null;
	let lastRenderTime = 0;
	let lastCanvasWidth = initialSize.width;
	let lastCanvasHeight = initialSize.height;
	const mobilePosePos = new Vector3();
	const mobilePoseLook = new Vector3();

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

	function syncMobileShelfCamera(t: number, pans?: readonly number[]): void {
		const sample = sampleMobileShelfTrack(t, { allowOverflow: true });
		const panSource = pans ?? scrollController?.panByRow ?? [0, 0, 0];
		const pan = sampleMobileShelfPan(t, panSource);
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

	function writeMobilePose(t: number, pos: Vector3, look: Vector3): void {
		const sample = sampleMobileShelfTrack(t, { allowOverflow: true });
		const panSource = scrollController?.panByRow ?? [0, 0, 0];
		const pan = sampleMobileShelfPan(t, panSource);
		const responsive = getMobileShelfResponsiveLayout();
		pos.set(
			MOBILE_POS.x + responsive.cameraX,
			sample.cameraY,
			MOBILE_POS.z + pan * responsive.cameraZRange,
		);
		look.set(
			MOBILE_LOOK.x + responsive.lookX,
			sample.lookY,
			MOBILE_LOOK.z + pan * responsive.lookZRange,
		);
	}

	// ─── Create desk content ─────────────────────────────────────
	function createDeskContent(): void {
		if (deskCreated) return;
		deskCreated = true;

		setupDeskLighting(room);

		const desk = createDesk();
		const deskLamp = createDeskLamp();
		const notebook = createNotebook();
		const laptop = createLaptop();
		const bookStack = createBookStack(books);
		const photoFrame = createPhotoFrame();
		const mug = createMug();
		const pen = createPen();
		const roots: Object3D[] = [
			desk,
			deskLamp,
			notebook.root,
			laptop.root,
			bookStack.root,
			photoFrame.root,
			mug,
			pen,
		];

		for (const root of roots) {
			room.add(root);
		}

		if (window.innerWidth >= MOBILE_BREAKPOINT) {
			const guitarPick = createGuitarPick();
			const circuitBoard = createCircuitBoard();
			roots.push(guitarPick, circuitBoard);
			room.add(guitarPick);
			room.add(circuitBoard);
		}

		const interactiveEntities: DeskInteractiveEntity[] = [
			{
				kind: "section",
				section: getSectionById("blog"),
				root: notebook.root,
				hitboxPadding: 0.1,
				obstacleRadius: 0.5,
				hoverScale: true,
				modalDelayMs: 350,
				open: () => animateNotebookOpen(notebook),
				close: () => animateNotebookClose(notebook),
			},
			{
				kind: "section",
				section: getSectionById("projects"),
				root: laptop.root,
				hitboxPadding: 0.1,
				obstacleRadius: 0.6,
				hoverScale: true,
				modalDelayMs: 350,
				open: () => animateLaptopOpen(laptop),
				close: () => animateLaptopClose(laptop),
			},
			{
				kind: "section",
				section: getSectionById("reading"),
				root: bookStack.root,
				hitboxPadding: 0.1,
				obstacleRadius: 0.45,
				hoverScale: true,
				modalDelayMs: 820,
				open: () => animateBookLift(bookStack),
				close: () => animateBookClose(bookStack),
			},
			{
				kind: "section",
				section: getSectionById("photos"),
				root: photoFrame.root,
				hitboxPadding: 0.15,
				hoverScale: true,
				modalDelayMs: 350,
				open: () => animateFrameReveal(photoFrame),
				close: () => animateFrameClose(photoFrame),
			},
			{
				kind: "micro",
				root: deskLamp,
				hitboxPadding: 0.05,
				obstacleRadius: 0.2,
				hoverScale: true,
				activate: () => {
					toggleLamp(deskLamp);
				},
			},
			{
				kind: "micro",
				root: mug,
				activate: () => {
					void animateWobble(mug);
				},
			},
			{
				kind: "micro",
				root: pen,
				activate: () => {
					void animateSpin(pen);
				},
			},
		];

		for (const entity of interactiveEntities) {
			if (entity.hitboxPadding !== undefined) {
				addHitbox(entity.root, entity.hitboxPadding);
			}
			if (entity.obstacleRadius !== undefined) {
				deskPhysics.addStaticObstacle(entity.root, entity.obstacleRadius);
			}
		}

		deskScene = {
			roots,
			interactiveEntityByRoot: new Map(interactiveEntities.map((entity) => [entity.root, entity])),
			hoverTargets: interactiveEntities
				.filter((entity) => entity.hoverScale)
				.map((entity) => entity.root),
		};
	}

	// ─── Create shelf content ────────────────────────────────────
	function createShelfContent(): void {
		if (shelfCreated) return;
		shelfCreated = true;

		setupShelfLighting(room, currentMode === "mobile");
		const shelf = createShelfWall(books);
		shelfScene = {
			...shelf,
			entryByTarget: new Map(shelf.entries.map((entry) => [entry.target, entry])),
		};
		room.add(shelf.wall);
	}

	// ─── Visibility helpers ──────────────────────────────────────
	function setDeskVisible(visible: boolean): void {
		if (!deskScene) return;
		for (const root of deskScene.roots) {
			root.visible = visible;
		}
	}

	function setShelfVisible(visible: boolean): void {
		if (shelfScene) shelfScene.wall.visible = visible;
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
		if (pendingModalTimeout) {
			window.clearTimeout(pendingModalTimeout);
			pendingModalTimeout = 0;
		}
		currentHover = null;
		openSelection = null;
		labelController.update(null, camera, canvas);

		if (currentMode === "desktop" && deskScene) {
			const desk = deskScene;
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

					const entity = desk.interactiveEntityByRoot.get(interaction.object);
					if (!entity) return;

					if (entity.kind === "micro") {
						clickLockedUntil = performance.now() + 200;
						entity.activate();
						dirty = true;
						return;
					}

					if (openSelection?.mode === "desktop" && openSelection.entity === entity) return;
					clickLockedUntil = performance.now() + CLICK_COOLDOWN_MS;

					if (openSelection?.mode === "desktop") {
						void openSelection.entity.close();
					}
					openSelection = { mode: "desktop", entity };
					void entity.open();

					if (pendingModalTimeout) window.clearTimeout(pendingModalTimeout);
					const { label, href } = entity.section;
					pendingModalTimeout = window.setTimeout(() => {
						pendingModalTimeout = 0;
						if (disposed) return;
						const modal = getContentModal();
						if (modal) modal.open(label, href);
						else window.location.href = href;
					}, entity.modalDelayMs);

					trackEvent("desk_object_click", { label, href });
				},
			);
		} else if (currentMode === "mobile" && shelfScene) {
			scrollController = createMobileScrollController(canvas, {
				verticalStops: MOBILE_SHELF_SCROLL.verticalStops,
				panSnapPoints: MOBILE_SHELF_SCROLL.panSnapPoints,
				panLimit: MOBILE_SHELF_SCROLL.panLimit,
				numRows: MOBILE_SHELF_STOPS.length,
			});
			scrollController.resetTo(0.5);

			const sc = scrollController;
			const shelf = shelfScene;
			const interactionPicker = createInteractionPicker(canvas, camera, scene);
			const previousTouchAction = canvas.style.touchAction;
			canvas.style.touchAction = "none";

			function handleShelfInteraction(interaction: DeskInteraction): void {
				if (!introComplete || transitioning) return;
				const entry = shelf.entryByTarget.get(interaction.object);
				if (!entry) return;
				if (openSelection?.mode === "mobile" && openSelection.entry === entry) return;
				if (performance.now() < clickLockedUntil) return;
				clickLockedUntil = performance.now() + CLICK_COOLDOWN_MS;

				if (openSelection?.mode === "mobile") {
					void animateShelfReset(openSelection.entry.item);
				}
				openSelection = { mode: "mobile", entry };
				const activeSelection = openSelection;
				const section = getSectionById(entry.sectionId);
				void animateShelfPresent(entry.item)
					.then(() => {
						if (disposed || openSelection !== activeSelection) return;
						const modal = getContentModal();
						const href = entry.href ?? section.href;
						if (modal) modal.open(section.label, href, entry.source);
						else window.location.href = href;
					})
					.catch(() => {});

				dirty = true;
				trackEvent("shelf_item_tap", { label: section.label, href: section.href });
			}

			function onPointerDown(e: PointerEvent): void {
				if (currentMode !== "mobile" || transitioning || !introComplete) return;
				if (sc.onPointerDown(e)) dirty = true;
			}

			function onPointerMove(e: PointerEvent): void {
				if (currentMode !== "mobile") return;
				if (sc.onPointerMove(e)) dirty = true;
			}

			function onPointerUp(e: PointerEvent): void {
				const changed = sc.onPointerUp(e);
				const tap = sc.consumeTap();
				if (tap) {
					const interaction = interactionPicker.getInteractionAt(tap.clientX, tap.clientY);
					if (interaction) handleShelfInteraction(interaction);
				}
				if (changed || tap) dirty = true;
			}

			function onPointerCancel(e: PointerEvent): void {
				if (sc.onPointerCancel(e)) dirty = true;
			}

			function onLostPointerCapture(): void {
				if (sc.cancelActiveGesture()) dirty = true;
			}

			function onWindowBlur(): void {
				if (sc.cancelActiveGesture()) dirty = true;
			}

			function onVisibilityChange(): void {
				if (document.visibilityState !== "hidden") return;
				if (sc.cancelActiveGesture()) dirty = true;
			}

			function onWheel(e: WheelEvent): void {
				if (currentMode !== "mobile" || transitioning || !introComplete) return;
				if (sc.onWheel(e)) dirty = true;
			}

			canvas.addEventListener("wheel", onWheel, { passive: false });
			canvas.addEventListener("pointerdown", onPointerDown);
			canvas.addEventListener("pointermove", onPointerMove);
			canvas.addEventListener("pointerup", onPointerUp);
			canvas.addEventListener("pointercancel", onPointerCancel);
			canvas.addEventListener("lostpointercapture", onLostPointerCapture);
			window.addEventListener("blur", onWindowBlur);
			document.addEventListener("visibilitychange", onVisibilityChange);

			cleanupMobileShelfControls = () => {
				canvas.style.touchAction = previousTouchAction;
				canvas.removeEventListener("wheel", onWheel);
				canvas.removeEventListener("pointerdown", onPointerDown);
				canvas.removeEventListener("pointermove", onPointerMove);
				canvas.removeEventListener("pointerup", onPointerUp);
				canvas.removeEventListener("pointercancel", onPointerCancel);
				canvas.removeEventListener("lostpointercapture", onLostPointerCapture);
				window.removeEventListener("blur", onWindowBlur);
				document.removeEventListener("visibilitychange", onVisibilityChange);
				sc.dispose();
			};

			cleanupInteraction = setupInteraction(
				canvas,
				camera,
				scene,
				() => {
					dirty = true;
				},
				handleShelfInteraction,
				{ enableHover: false, enablePointerClick: false },
			);
		}

		// Modal close handler
		const modal = getContentModal();
		cleanupModalClose =
			modal?.onClose(() => {
				if (!openSelection) return;
				if (openSelection.mode === "desktop") {
					void openSelection.entity.close();
				} else {
					void animateShelfReset(openSelection.entry.item);
				}
				openSelection = null;
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
		syncMobileShelfCamera(0.5);
	}

	setupModeInteractions();

	// ─── Render loop ─────────────────────────────────────────────
	const startTime = performance.now();
	let animationId: number;
	let lastFrame = 0;
	let targetInterval = isInitiallyMobile ? 1000 / 60 : 0;

	function render(now: number): void {
		if (disposed || contextLost) return;
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
				if (introComplete) syncMobileShelfCamera(scrollController?.verticalT ?? 0.5);
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

		if (currentMode === "mobile" && !transitioning && scrollController) {
			// Compute dt from last frame (frame-rate independent)
			const dt = lastRenderTime > 0 ? Math.min((now - lastRenderTime) / 1000, 0.05) : 1 / 60;
			lastRenderTime = now;

			if (scrollController.tick(dt)) {
				syncMobileShelfCamera(scrollController.verticalT);
				dirty = true;
			}
		}

		// Hover scale lerp (desktop only)
		if (currentMode === "desktop" && deskScene && !transitioning) {
			for (const obj of deskScene.hoverTargets) {
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
		if (disposed || contextLost) return;
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
		if (currentMode === "mobile" && !transitioning) {
			syncMobileShelfCamera(scrollController?.verticalT ?? 0.5);
		}

		// Render immediately so the resized canvas doesn't flash black
		if (currentMode === "desktop" || transitioning) {
			composer.render();
		} else {
			renderer.render(scene, camera);
		}
		dirty = false;
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

	// ─── WebGL context loss safety net ───────────────────────────
	// Prevents a GPU hang from escalating to a frozen compositor.
	function onContextLost(event: Event): void {
		event.preventDefault(); // Signal the browser to attempt restoration
		contextLost = true;
		cancelAnimationFrame(animationId);
		if (resizeFrame) {
			cancelAnimationFrame(resizeFrame);
			resizeFrame = 0;
		}
	}

	function onContextRestored(): void {
		contextLost = false;
		dirty = true;
		animationId = requestAnimationFrame(render);
	}

	canvas.addEventListener("webglcontextlost", onContextLost);
	canvas.addEventListener("webglcontextrestored", onContextRestored);

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
		if (openSelection) {
			if (openSelection.mode === "desktop") {
				void openSelection.entity.close();
			} else {
				void animateShelfReset(openSelection.entry.item);
			}
			openSelection = null;
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
		writeMobilePose(scrollController?.verticalT ?? 0.5, mobilePosePos, mobilePoseLook);
		const fromPos = currentMode === "desktop" ? camera.position.clone() : mobilePosePos.clone();
		const fromLook = currentMode === "desktop" ? DESKTOP_LOOK.clone() : mobilePoseLook.clone();
		writeMobilePose(0.5, mobilePosePos, mobilePoseLook);
		const toPos = target === "desktop" ? DESKTOP_POS.clone() : mobilePosePos.clone();
		const toLook = target === "desktop" ? DESKTOP_LOOK.clone() : mobilePoseLook.clone();

		// Smoothly fade bloom to avoid render-path flicker at transition end
		const bloomFrom = currentMode === "desktop" ? 0.6 : 0;
		const bloomTo = target === "desktop" ? 0.6 : 0;
		bloomPass.strength = bloomFrom;

		// Animate transition
		await new Promise<void>((resolve) => {
			transitionResolve = resolve;
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

				// Fade bloom so the composer→renderer switch is invisible
				bloomPass.strength = bloomFrom + (bloomTo - bloomFrom) * eased;

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
		transitionResolve = null;

		// Settle into target mode
		currentMode = target;
		room.rotation.y = toRotY;

		// Hide the wall we're not looking at
		if (target === "desktop") {
			setShelfVisible(false);
			applyRenderSettings("desktop");
			// setPixelRatio clears the canvas buffer — re-sync composer and
			// render immediately so the browser never paints a black frame
			composer.setSize(lastCanvasWidth, lastCanvasHeight);
			bloomPass.resolution.set(lastCanvasWidth, lastCanvasHeight);
			composer.render();
			targetInterval = 0;
		} else {
			// scrollController will be created by setupModeInteractions() below
			syncMobileShelfCamera(0.5);
			postTransitionRaf = requestAnimationFrame(() => {
				postTransitionRaf = 0;
				if (disposed) return;
				if (currentMode === "mobile" && !transitioning && scrollController) {
					syncMobileShelfCamera(scrollController.verticalT);
					dirty = true;
				}
			});
			setDeskVisible(false);
			applyRenderSettings("mobile");
			// setPixelRatio clears the canvas buffer — render immediately
			// so the browser never paints a black frame
			renderer.render(scene, camera);
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
		if (disposed) return;
		disposed = true;

		canvas.removeEventListener("webglcontextlost", onContextLost);
		canvas.removeEventListener("webglcontextrestored", onContextRestored);
		resizeObserver?.disconnect();
		cancelAnimationFrame(animationId);
		if (resizeFrame) cancelAnimationFrame(resizeFrame);
		if (transitionAnimationId) cancelAnimationFrame(transitionAnimationId);
		// Settle any in-flight transition promise so the async chain can GC
		if (transitionResolve) {
			transitionResolve();
			transitionResolve = null;
		}
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
		bloomPass.dispose();
		composer.dispose();

		// Force the browser to drop the GL context immediately rather than
		// waiting for GC — critical on Linux/Mesa where lingering contexts
		// can exhaust GPU memory and hang the compositor.
		const gl = renderer.getContext();
		gl.getExtension("WEBGL_lose_context")?.loseContext();
		renderer.dispose();
	}

	return { cleanup, transition };
}
