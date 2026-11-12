import {
	Box3,
	Color,
	FogExp2,
	Group,
	HalfFloatType,
	Mesh,
	MeshStandardMaterial,
	type Object3D,
	PlaneGeometry,
	Scene,
	Vector2,
	Vector3,
	WebGLRenderer,
	WebGLRenderTarget,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { trackEvent } from "../analytics";
import { getSectionById, type SiteSection, site } from "../config";
import type { ShelfBook, SpotlightInfo } from "../content/types";
import {
	animateBoardBlink,
	animateBookClose,
	animateBookLift,
	animateDictionaryClose,
	animateDictionaryOpen,
	animateFrameClose,
	animateFrameReveal,
	animateFrameWobble,
	animateLaptopClose,
	animateLaptopOpen,
	animateNotebookClose,
	animateNotebookOpen,
	animatePhoneSleep,
	animatePhoneWake,
	animatePickFlip,
	animateShelfPresent,
	animateShelfReset,
	animateSignSwing,
	animateSpin,
	animateWobble,
	bookPresentedPosition,
	type DeskCameraView,
	disposeAnimations,
	easeInOutCubic,
	tickAnimations,
} from "./animations";
import {
	animateIntro,
	animateMobileIntro,
	BASE_FOV,
	type CameraFocusAnimation,
	createCamera,
	DESKTOP_LOOK,
	DESKTOP_POS,
	desktopFovForAspect,
	FOCUS_IN_MS,
	FOCUS_OUT_MS,
	focusPoseFor,
	idleFloat,
	lerpCameraPose,
	MOBILE_LOOK,
	MOBILE_POS,
	stepCameraFocus,
} from "./camera";
import { DARK, GROUND_DARK } from "./colors";
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
import { resetSharedMaterials } from "./materials";
import { clamp, lerp } from "./math-utils";
import { createMobileScrollController, type MobileScrollController } from "./mobile-scroll";
import { createBookStack } from "./objects/book-stack";
import { createCircuitBoard } from "./objects/circuit-board";
import { createDeskLamp, toggleLamp } from "./objects/desk-lamp";
import { createDeskWindow } from "./objects/desk-window";
import { createDictionary } from "./objects/dictionary";
import { createGreetingSign } from "./objects/greeting-sign";
import { createGuitarPick } from "./objects/guitar-pick";
import { createLaptop } from "./objects/laptop";
import { createMug } from "./objects/mug";
import { createNotebook } from "./objects/notebook";
import { createPen } from "./objects/pen";
import { createPhotoFrame } from "./objects/photo-frame";
import { createShelfWall, type ShelfDecorEntry, type ShelfSceneEntry } from "./objects/shelf-wall";
import { createSpotlightFrame, disposeSpotlightTextures } from "./objects/spotlight-frame";
import { invalidateCanvasRect } from "./raycast-utils";
import { createRoomWall } from "./room-wall";
import {
	MOBILE_SHELF_SCROLL,
	MOBILE_SHELF_STOPS,
	MOBILE_TRANSITION_MID_LOOK,
	MOBILE_TRANSITION_MID_POS,
	SHELF_BOT_Y,
	SHELF_MID_Y,
	SHELF_TOP_Y,
} from "./shelf-layout";

const BLOOM_STRENGTH = 0.6;

/** A quick white camera flash over the whole view (skipped for reduced motion). */
function fireCameraFlash(): void {
	if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
	const flash = document.createElement("div");
	flash.setAttribute("aria-hidden", "true");
	flash.style.cssText =
		"position:fixed;inset:0;z-index:60;pointer-events:none;background:#fff;opacity:0.9";
	document.body.appendChild(flash);
	flash
		.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 450, easing: "ease-out" })
		.finished.finally(() => flash.remove());
}

interface DeskSectionEntity {
	kind: "section";
	section: SiteSection;
	root: Object3D;
	hitboxPadding: number;
	obstacleRadius?: number;
	hoverScale?: boolean;
	modalDelayMs: number;
	/** Receives the camera pose the desk will settle on, so objects that
	 *  present themselves to the viewer aim at the zoomed-in camera. */
	open: (view: DeskCameraView) => Promise<void>;
	close: () => Promise<void>;
	/** Where the camera should look, when not the object's resting centre
	 *  (e.g. a book that lifts off its stack). */
	focusTarget?: (out: Vector3) => Vector3;
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
	/** Stops timers the desk objects run (the window's sky clock). */
	cleanup: () => void;
	interactiveEntityByRoot: Map<Object3D, DeskInteractiveEntity>;
	hoverTargets: Object3D[];
}

interface ShelfSceneData {
	wall: Group;
	entries: ShelfSceneEntry[];
	entryByTarget: Map<Object3D, ShelfSceneEntry>;
	decorByTarget: Map<Object3D, ShelfDecorEntry>;
	hoverTargets: Object3D[];
	cleanup?: () => void;
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

// ─── Scene constants ────────────────────────────────────────────
const FOG_DENSITY = 0.04;
const MAX_FRAME_DELTA_SEC = 0.05;
const CAMERA_DELTA_THRESHOLD = 0.001;
// Below this scale delta the hover lerp snaps to its target instead of
// continuing — the tail is sub-visible but each step re-renders shadow maps.
const HOVER_SNAP_EPSILON = 0.005;
const IDLE_INTERVAL = 1000 / 30; // cap at 30 FPS when idle
const IDLE_RESTORE_DELAY_MS = 150;

// ─── Unified scene ───────────────────────────────────────────────
export function initUnifiedScene(
	canvas: HTMLCanvasElement,
	labelContainer: HTMLElement,
	initialMode: "desktop" | "mobile",
	books?: ShelfBook[],
	options?: {
		skipIntro?: boolean;
		spotlight?: SpotlightInfo;
		onContextRestored?: () => void;
		onSectionClick?: (label: string, href: string, source?: string) => void;
		onSectionClose?: (cb: () => void) => (() => void) | undefined;
	},
): { cleanup: () => void; transition: (target: "desktop" | "mobile") => Promise<void> } {
	const scene = new Scene();
	scene.background = new Color(DARK);
	scene.fog = new FogExp2(new Color(DARK), FOG_DENSITY);

	// Live query (not a cached boolean) so OS-level preference changes made
	// while the page is open take effect on the next read.
	const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
	const prefersReducedMotion = () => reducedMotionQuery.matches;

	const renderer = new WebGLRenderer({
		canvas,
		// Antialiasing cannot be changed without recreating the WebGL context.
		// Keep it stable so transitions don't inherit the initial mode's setting.
		antialias: true,
		powerPreference: "high-performance",
	});

	// Mark the canvas so scene-app knows it already has a WebGL context with
	// the correct attributes and can probe it on re-mount instead of replacing.
	canvas.dataset.sceneUsed = "true";
	let roomLighting: ReturnType<typeof setupRoomLighting> | null = null;

	function applyRenderSettings(mode: "desktop" | "mobile"): void {
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, mode === "mobile" ? 1.25 : 2));
		renderer.shadowMap.enabled = true;
		roomLighting?.updateForMode(mode === "mobile");
		// Disable auto shadow updates — shadows only change when objects move
		// (animations, transitions), not during camera scroll. Trigger manually
		// via renderer.shadowMap.needsUpdate = true where needed.
		renderer.shadowMap.autoUpdate = false;
		renderer.shadowMap.needsUpdate = true;
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
	const camera = createCamera(initialSize.width / initialSize.height);
	const labelController = createLabelController(labelContainer);
	const deskPhysics = createDeskPhysicsController();
	applyRenderSettings(initialMode);
	renderer.setSize(initialSize.width, initialSize.height, false);

	// Post-processing — bloom for screen glow (desktop/transition)
	// The composer renders into its own buffer, which skips the canvas's
	// antialiasing; multisample that buffer so edges stay smooth through bloom.
	const composer = new EffectComposer(
		renderer,
		new WebGLRenderTarget(initialSize.width, initialSize.height, {
			type: HalfFloatType,
			samples: 4,
		}),
	);
	const renderPass = new RenderPass(scene, camera);
	composer.addPass(renderPass);
	// Strength, radius, threshold. Radius 0 so the per-level weights below
	// apply as written.
	const bloomPass = new UnrealBloomPass(
		new Vector2(initialSize.width, initialSize.height),
		BLOOM_STRENGTH,
		0,
		0.7,
	);
	// The bloom blurs at five sizes; the two widest spread a lit sign or lamp
	// into big faint discs across the room. Keep only the tight levels, so
	// glows hug whatever emits them.
	bloomPass.compositeMaterial.uniforms.bloomFactors.value = [1.0, 0.75, 0.35, 0, 0];
	// Desk-only: the shelf has no screen-wide glow (the sign glows on its own).
	if (initialMode !== "desktop") bloomPass.strength = 0;
	composer.addPass(bloomPass);

	// ─── Room group ──────────────────────────────────────────────
	const room = new Group();
	scene.add(room);
	roomLighting = setupRoomLighting(room, initialMode === "mobile");

	// Shared ground plane — single floor for both desk and shelf scenes
	const groundMat = new MeshStandardMaterial({
		color: new Color(GROUND_DARK),
		roughness: 0.95,
		metalness: 0.0,
		// Dithered so the soft light falloff across the dark floor doesn't band.
		dithering: true,
	});
	// Big enough that its edge never comes into view, even from the intro's
	// high, wide start.
	const ground = new Mesh(new PlaneGeometry(80, 80), groundMat);
	ground.rotation.x = -Math.PI / 2;
	ground.position.y = -2;
	ground.receiveShadow = true;
	room.add(ground);

	// Scene-level lighting (direction-independent)
	setupSceneLighting(scene);
	applyRenderSettings(initialMode);

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
	// Desk camera focus: glide toward a clicked object, and back on close.
	let cameraFocusAnim: CameraFocusAnimation | null = null;
	let cameraFocused = false;
	const cameraLook = DESKTOP_LOOK.clone();
	const _focusBox = new Box3();
	const _focusTarget = new Vector3();
	let transitionAnimationId = 0;
	let transitionResolve: (() => void) | null = null;

	// Wall state — lazily created
	let deskCreated = false;
	let shelfCreated = false;
	let deskScene: DeskSceneData | null = null;
	let shelfScene: ShelfSceneData | null = null;
	let cleanupDeskLights: (() => void) | null = null;
	let cleanupShelfLights: (() => void) | null = null;

	// Interaction & drag cleanup references
	let cleanupInteraction: (() => void) | null = null;
	let cleanupDrag: (() => void) | null = null;
	let cleanupMobileShelfControls: (() => void) | null = null;
	let lastRenderTime = 0;
	let lastCanvasWidth = initialSize.width;
	let lastCanvasHeight = initialSize.height;
	const mobilePosePos = new Vector3();
	const mobilePoseLook = new Vector3();

	let cachedResponsive = {
		cameraX: 0,
		lookX: 0,
		cameraZRange: 0.4,
		lookZRange: 0.65,
	};

	function updateResponsiveLayout(): void {
		const narrowness = clamp((430 - lastCanvasWidth) / 150, 0, 1);
		cachedResponsive = {
			cameraX: lerp(0, -0.95, narrowness),
			lookX: lerp(0, -0.22, narrowness),
			cameraZRange: lerp(0.4, 1.1, narrowness),
			lookZRange: lerp(0.65, 1.55, narrowness),
		};
	}
	updateResponsiveLayout();

	function interpolatePan(
		sample: { index: number; nextIndex: number; localT: number },
		pans: readonly number[],
	): number {
		if (sample.index === sample.nextIndex) return pans[sample.index] ?? 0;
		return lerp(pans[sample.index] ?? 0, pans[sample.nextIndex] ?? 0, sample.localT);
	}

	function syncMobileShelfCamera(t: number, pans?: readonly number[]): void {
		const sample = sampleMobileShelfTrack(t, { allowOverflow: true });
		const panSource = pans ?? scrollController?.panByRow ?? [0, 0, 0];
		// Clamp t for pan so rubber-band overscroll doesn't extrapolate lateral pan
		const panSample = sampleMobileShelfTrack(clamp(t, 0, 1));
		const pan = interpolatePan(panSample, panSource);
		camera.position.set(
			MOBILE_POS.x + cachedResponsive.cameraX,
			sample.cameraY,
			MOBILE_POS.z + pan * cachedResponsive.cameraZRange,
		);
		camera.lookAt(
			MOBILE_LOOK.x + cachedResponsive.lookX,
			sample.lookY,
			MOBILE_LOOK.z + pan * cachedResponsive.lookZRange,
		);
	}

	function writeMobilePose(t: number, pos: Vector3, look: Vector3): void {
		const sample = sampleMobileShelfTrack(t, { allowOverflow: true });
		const panSource = scrollController?.panByRow ?? [0, 0, 0];
		const panSample = sampleMobileShelfTrack(clamp(t, 0, 1));
		const pan = interpolatePan(panSample, panSource);
		pos.set(
			MOBILE_POS.x + cachedResponsive.cameraX,
			sample.cameraY,
			MOBILE_POS.z + pan * cachedResponsive.cameraZRange,
		);
		look.set(
			MOBILE_LOOK.x + cachedResponsive.lookX,
			sample.lookY,
			MOBILE_LOOK.z + pan * cachedResponsive.lookZRange,
		);
	}

	// ─── Spotlight popup ─────────────────────────────────────────
	let spotlightPopupEl: HTMLElement | null = null;
	let spotlightDismissHandler: ((e: MouseEvent) => void) | null = null;
	let spotlightDismissTimeout = 0;

	function dismissSpotlightPopup(): void {
		if (spotlightDismissTimeout) {
			clearTimeout(spotlightDismissTimeout);
			spotlightDismissTimeout = 0;
		}
		if (spotlightPopupEl) {
			spotlightPopupEl.remove();
			spotlightPopupEl = null;
		}
		if (spotlightDismissHandler) {
			document.removeEventListener("pointerdown", spotlightDismissHandler);
			spotlightDismissHandler = null;
		}
	}

	function showSpotlightPopup(root: Object3D, spotlight?: SpotlightInfo | null): void {
		if (!spotlight) return;
		dismissSpotlightPopup();

		const pos = new Vector3();
		root.getWorldPosition(pos);
		pos.project(camera);
		const rect = canvas.getBoundingClientRect();
		const x = ((pos.x + 1) / 2) * rect.width + rect.left;
		const y = ((-pos.y + 1) / 2) * rect.height + rect.top;

		const popup = document.createElement("div");
		popup.className = "spotlight-popup";

		const img = document.createElement("img");
		img.src = spotlight.image;
		img.alt = spotlight.title;
		popup.appendChild(img);

		const p = document.createElement("p");
		p.textContent = spotlight.name ? `${spotlight.title} — ${spotlight.name}` : spotlight.title;
		popup.appendChild(p);

		popup.style.cssText = `position:fixed;left:${x}px;top:${y - 20}px;transform:translate(-50%,-100%);z-index:60;`;

		document.body.appendChild(popup);
		spotlightPopupEl = popup;

		const dismiss = (e: MouseEvent) => {
			if (!(e.target instanceof Node) || !popup.contains(e.target)) dismissSpotlightPopup();
		};
		spotlightDismissHandler = dismiss;
		// Delay so the current click doesn't immediately dismiss
		spotlightDismissTimeout = window.setTimeout(() => {
			spotlightDismissTimeout = 0;
			document.addEventListener("pointerdown", dismiss);
		}, 100);
	}

	// ─── Create desk content ─────────────────────────────────────
	function createDeskContent(): void {
		if (deskCreated) return;
		deskCreated = true;

		cleanupDeskLights = setupDeskLighting(room);

		const desk = createDesk();
		const deskLamp = createDeskLamp();
		const notebook = createNotebook();
		const laptop = createLaptop();
		const bookStack = createBookStack(books);
		const photoFrame = createPhotoFrame();
		const mug = createMug();
		const pen = createPen();
		const dictionary = createDictionary();
		const spotlightFrame = createSpotlightFrame(options?.spotlight);
		const roots: Object3D[] = [
			desk,
			deskLamp,
			notebook.root,
			laptop.root,
			bookStack.root,
			photoFrame.root,
			dictionary.root,
			spotlightFrame.root,
			mug,
			pen,
		];

		// Back wall with the greeting sign and a window onto Boston's sky.
		const greetingRoot = new Group();
		const deskWall = createRoomWall(60);
		deskWall.position.z = -2.2;
		greetingRoot.add(deskWall);
		const greeting = createGreetingSign({
			title: `hi, I'm ${site.name.split(" ")[0]}.`,
			line: "pull up a chair, ignore the mess.",
			width: 2.6,
			// Glows on its own, kept under the desk bloom so it never blows out.
			glow: 0.05,
			halo: 0.4,
		});
		greeting.position.set(0, 2.55, -2.18);
		greeting.userData = { interactive: true };
		greetingRoot.add(greeting);
		const deskWindow = createDeskWindow(() => {
			markSceneActive();
			dirty = true;
		});
		deskWindow.root.position.set(3.4, 1.4, -2.19);
		// Hover text reads the live time each time it is shown.
		deskWindow.root.userData = { interactive: true, labelOffsetY: deskWindow.labelOffsetY };
		Object.defineProperty(deskWindow.root.userData, "label", { get: deskWindow.label });
		greetingRoot.add(deskWindow.root);
		roots.push(greetingRoot);

		for (const root of roots) {
			room.add(root);
		}

		let guitarPick: Group | null = null;
		let circuitBoard: Group | null = null;
		if (lastCanvasWidth >= MOBILE_BREAKPOINT) {
			guitarPick = createGuitarPick();
			circuitBoard = createCircuitBoard();
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
				focusTarget: (out) => bookPresentedPosition(bookStack, out),
				open: (view) => animateBookLift(bookStack, view),
				close: () => animateBookClose(bookStack),
			},
			{
				kind: "section",
				section: getSectionById("photos"),
				root: photoFrame.root,
				hitboxPadding: 0.15,
				hoverScale: true,
				modalDelayMs: 350,
				open: (view) => animateFrameReveal(photoFrame, view),
				close: () => animateFrameClose(photoFrame),
			},
			{
				kind: "section",
				section: getSectionById("wordOfTheDay"),
				root: dictionary.root,
				hitboxPadding: 0.1,
				obstacleRadius: 0.45,
				hoverScale: true,
				modalDelayMs: 800,
				open: () => animateDictionaryOpen(dictionary),
				close: () => animateDictionaryClose(dictionary),
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
				hitboxPadding: 0.04,
				activate: () => {
					void animateSpin(pen);
				},
			},
			{
				kind: "micro",
				root: spotlightFrame.root,
				hitboxPadding: 0.15,
				hoverScale: true,
				activate: () => {
					void animateFrameWobble(spotlightFrame.parts.frame);
					showSpotlightPopup(spotlightFrame.root, options?.spotlight);
				},
			},
		];

		interactiveEntities.push({
			kind: "micro",
			root: deskWindow.root,
			hitboxPadding: 0.05,
			activate: () => {
				deskWindow.playTimelapse();
			},
		});
		interactiveEntities.push({
			kind: "micro",
			root: greeting,
			hitboxPadding: 0.05,
			activate: () => {
				void animateSignSwing(greeting);
			},
		});

		if (guitarPick) {
			const pick = guitarPick;
			interactiveEntities.push({
				kind: "micro",
				root: pick,
				hitboxPadding: 0.04,
				activate: () => {
					void animatePickFlip(pick);
				},
			});
		}
		if (circuitBoard) {
			const board = circuitBoard;
			interactiveEntities.push({
				kind: "micro",
				root: board,
				activate: () => {
					void animateBoardBlink(board);
				},
			});
		}

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
			cleanup: () => deskWindow.dispose(),
			interactiveEntityByRoot: new Map(interactiveEntities.map((entity) => [entity.root, entity])),
			hoverTargets: interactiveEntities
				.filter((entity) => entity.hoverScale)
				.map((entity) => entity.root),
		};
	}

	function resetShelfSelection(): void {
		if (!openSelection || openSelection.mode !== "mobile") return;
		void animateShelfReset(openSelection.entry.item);
		if (openSelection.entry.source === "phone") void animatePhoneSleep(openSelection.entry.item);
	}

	// ─── Create shelf content ────────────────────────────────────
	function createShelfContent(mobileMode = currentMode === "mobile"): void {
		if (shelfCreated) return;
		shelfCreated = true;

		cleanupShelfLights = setupShelfLighting(room, mobileMode);
		const shelf = createShelfWall(books, options?.spotlight);
		shelfScene = {
			...shelf,
			entryByTarget: new Map(shelf.entries.map((entry) => [entry.target, entry])),
			decorByTarget: new Map(shelf.decor.map((d) => [d.target, d])),
			hoverTargets: shelf.entries.map((e) => e.target),
			cleanup: shelf.cleanup,
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

	// ─── Disposal helpers for scene transitions ──────────────────
	function disposeDeskScene(): void {
		if (!deskScene) return;
		deskScene.cleanup();
		cleanupDeskLights?.();
		cleanupDeskLights = null;
		for (const root of deskScene.roots) {
			room.remove(root);
			disposeObjectResources(root);
		}
		deskPhysics.dispose();
		deskScene = null;
		deskCreated = false;
	}

	function disposeShelfScene(): void {
		if (!shelfScene) return;
		cleanupShelfLights?.();
		cleanupShelfLights = null;
		shelfScene.cleanup?.();
		room.remove(shelfScene.wall);
		disposeObjectResources(shelfScene.wall);
		shelfScene = null;
		shelfCreated = false;
	}

	// ─── Setup interactions for current mode ─────────────────────
	function startCameraFocus(toPos: Vector3, toLook: Vector3, duration: number): void {
		cameraFocusAnim = {
			fromPos: camera.position.clone(),
			fromLook: cameraLook.clone(),
			toPos: toPos.clone(),
			toLook: toLook.clone(),
			start: performance.now(),
			duration,
		};
		markSceneActive();
		dirty = true;
	}

	/** The pose the camera will glide to for `root` (the desk pose when motion is reduced). */
	function planCameraFocus(entity: DeskSectionEntity): DeskCameraView {
		if (prefersReducedMotion()) {
			return { pos: DESKTOP_POS.clone(), look: DESKTOP_LOOK.clone() };
		}
		if (entity.focusTarget) entity.focusTarget(_focusTarget);
		else _focusBox.setFromObject(entity.root).getCenter(_focusTarget);
		const pos = new Vector3();
		const look = new Vector3();
		focusPoseFor(_focusTarget, pos, look);
		return { pos, look };
	}

	function focusCamera(view: DeskCameraView): void {
		if (prefersReducedMotion()) return;
		cameraFocused = true;
		startCameraFocus(view.pos, view.look, FOCUS_IN_MS);
	}

	function unfocusCamera(): void {
		if (!cameraFocused) return;
		cameraFocused = false;
		startCameraFocus(DESKTOP_POS, DESKTOP_LOOK, FOCUS_OUT_MS);
	}

	function resetCameraFocus(): void {
		cameraFocusAnim = null;
		cameraFocused = false;
		cameraLook.copy(DESKTOP_LOOK);
	}

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
		labelController.update(null, camera, lastCanvasWidth, lastCanvasHeight);

		if (currentMode === "desktop" && deskScene) {
			const desk = deskScene;
			cleanupDrag = deskPhysics.setupDrag(
				canvas,
				camera,
				scene,
				(dragging) => {
					isDragging = dragging;
					markSceneActive();
					dirty = true;
				},
				() => {
					dirty = true;
					// Dragged objects move outside the physics/animation ticks, so
					// shadow maps must be flagged for recompute here too
					renderer.shadowMap.needsUpdate = true;
				},
			);

			cleanupInteraction = setupInteraction(
				canvas,
				camera,
				scene,
				(interaction) => {
					if (isDragging) return;
					currentHover = interaction;
					markSceneActive();
					dirty = true;
				},
				(interaction) => {
					if (isDragging || !introComplete) return;
					if (performance.now() < clickLockedUntil) return;

					const entity = desk.interactiveEntityByRoot.get(interaction.object);
					if (!entity) return;

					if (entity.kind === "micro") {
						clickLockedUntil = performance.now() + 200;
						markSceneActive();
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
					markSceneActive();
					// Plan the camera's end pose first so the object's own open
					// animation can aim at it, then start both together.
					const view = planCameraFocus(entity);
					void entity.open(view);
					focusCamera(view);

					if (pendingModalTimeout) window.clearTimeout(pendingModalTimeout);
					const { label, href } = entity.section;
					// Let the camera get most of the way there before the view fades in.
					const revealDelay = prefersReducedMotion()
						? entity.modalDelayMs
						: Math.max(entity.modalDelayMs, FOCUS_IN_MS - 150);
					pendingModalTimeout = window.setTimeout(() => {
						pendingModalTimeout = 0;
						if (disposed) return;
						if (options?.onSectionClick) options.onSectionClick(label, href);
						else window.location.href = href;
					}, revealDelay);

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
			if (scrollController.resetTo(0.5)) dirty = true;

			const sc = scrollController;
			const shelf = shelfScene;
			const interactionPicker = createInteractionPicker(canvas, camera, scene);
			const shelfStopByTarget = new Map<Object3D, number>();
			{
				const shelfYs = [SHELF_BOT_Y, SHELF_MID_Y, SHELF_TOP_Y];
				const byRow = new Map<number, { target: Object3D; z: number }[]>();
				for (const entry of shelf.entries) {
					const y = entry.target.position.y;
					let row = 0;
					let bestDist = Math.abs(y - shelfYs[0]);
					for (let i = 1; i < shelfYs.length; i++) {
						const d = Math.abs(y - shelfYs[i]);
						if (d < bestDist) {
							row = i;
							bestDist = d;
						}
					}
					if (!byRow.has(row)) byRow.set(row, []);
					byRow.get(row)?.push({ target: entry.target, z: entry.target.position.z });
				}
				for (const items of byRow.values()) {
					items.sort((a, b) => a.z - b.z);
				}
				let offset = 0;
				for (let row = 0; row < MOBILE_SHELF_SCROLL.panSnapPoints.length; row++) {
					const rowItems = byRow.get(row);
					if (rowItems) {
						for (let i = 0; i < rowItems.length; i++) {
							shelfStopByTarget.set(rowItems[i].target, offset + i);
						}
					}
					offset += MOBILE_SHELF_SCROLL.panSnapPoints[row].length;
				}
			}
			const previousTouchAction = canvas.style.touchAction;
			canvas.style.touchAction = "none";

			function handleShelfInteraction(interaction: DeskInteraction): void {
				if (!introComplete || transitioning) return;
				if (performance.now() < clickLockedUntil) return;

				// Check decorative items first
				const decorEntry = shelf.decorByTarget.get(interaction.object);
				if (decorEntry) {
					clickLockedUntil = performance.now() + 1000;
					markSceneActive();
					decorEntry.activate();
					dirty = true;
					trackEvent("shelf_decor_tap", { label: decorEntry.label });
					return;
				}

				const entry = shelf.entryByTarget.get(interaction.object);
				if (!entry) return;
				if (openSelection?.mode === "mobile" && openSelection.entry === entry) return;
				clickLockedUntil = performance.now() + CLICK_COOLDOWN_MS;

				if (openSelection?.mode === "mobile") resetShelfSelection();
				openSelection = { mode: "mobile", entry };
				markSceneActive();
				const activeSelection = openSelection;
				const section = getSectionById(entry.sectionId);

				// If this is the phone, glow the screen before falling
				if (entry.source === "camera") fireCameraFlash();
				const isPhone = entry.source === "phone";
				const presentChain = isPhone
					? animatePhoneWake(entry.item).then(() =>
							animateShelfPresent(entry.item, entry.frontClearance, camera.position),
						)
					: animateShelfPresent(entry.item, entry.frontClearance, camera.position);

				void presentChain
					.then(() => {
						if (disposed || openSelection !== activeSelection) return;
						const href = entry.href ?? section.href;
						if (options?.onSectionClick) options.onSectionClick(section.label, href, entry.source);
						else window.location.href = href;
					})
					.catch(() => {});

				dirty = true;
				trackEvent("shelf_item_tap", { label: section.label, href: section.href });
			}

			function onPointerDown(e: PointerEvent): void {
				if (currentMode !== "mobile" || transitioning || !introComplete) return;
				currentHover = null;
				markSceneActive();
				if (sc.onPointerDown(e)) dirty = true;
			}

			function onPointerMove(e: PointerEvent): void {
				if (currentMode !== "mobile") return;
				if (sc.onPointerMove(e)) dirty = true;
			}

			function onPointerUp(e: PointerEvent): void {
				if (sc.onPointerUp(e)) dirty = true;
				else markSceneActive();
				const tap = sc.consumeTap();
				if (tap) {
					const interaction = interactionPicker.getInteractionAt(tap.clientX, tap.clientY);
					if (interaction) handleShelfInteraction(interaction);
				}
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
				currentHover = null;
				markSceneActive();
				if (sc.onWheel(e)) dirty = true;
			}

			canvas.addEventListener("wheel", onWheel, { passive: false });
			canvas.addEventListener("pointerdown", onPointerDown);
			canvas.addEventListener("pointermove", onPointerMove, { passive: true });
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
				(interaction) => {
					currentHover = interaction;
					markSceneActive();
					dirty = true;
				},
				handleShelfInteraction,
				{
					enableHover: false,
					enablePointerClick: false,
					focusOnPointerDown: false,
					onTabNavigate: (interaction) => {
						const stopIdx = shelfStopByTarget.get(interaction.object);
						if (stopIdx !== undefined && sc.navigateToLinearStop(stopIdx)) {
							dirty = true;
						}
					},
				},
			);
		}

		// Modal close handler
		const onClose = () => {
			if (!openSelection) return;
			markSceneActive();
			if (openSelection.mode === "desktop") {
				void openSelection.entity.close();
				unfocusCamera();
			} else {
				resetShelfSelection();
			}
			openSelection = null;
			dirty = true;
		};
		cleanupModalClose = options?.onSectionClose?.(onClose) ?? null;
	}

	// ─── Initial setup ───────────────────────────────────────────
	if (initialMode === "desktop") {
		createDeskContent();
		room.rotation.y = 0;
		camera.fov = desktopFovForAspect(camera.aspect);
		camera.updateProjectionMatrix();
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
	let targetInterval = introComplete ? IDLE_INTERVAL : 0;
	let lastActiveAt = performance.now();
	let lastAnimating = false;
	let lastPhysicsActive = false;
	let lastScrollActivity = false;

	function markSceneActive(now = performance.now()): void {
		lastActiveAt = now;
		targetInterval = 0;
	}

	function canRestoreIdle(now: number): boolean {
		return now - lastActiveAt >= IDLE_RESTORE_DELAY_MS;
	}

	function isSceneRenderIdle(now: number): boolean {
		return (
			targetInterval === IDLE_INTERVAL &&
			introComplete &&
			!transitioning &&
			!isDragging &&
			!lastAnimating &&
			!lastPhysicsActive &&
			!lastScrollActivity &&
			canRestoreIdle(now)
		);
	}

	window.__sceneDebug = {
		get mode() {
			return currentMode;
		},
		get targetInterval() {
			return targetInterval;
		},
		get idleInterval() {
			return IDLE_INTERVAL;
		},
		get idleRestoreDelayMs() {
			return IDLE_RESTORE_DELAY_MS;
		},
		get isIdle() {
			return isSceneRenderIdle(performance.now());
		},
		get lastActiveAt() {
			return lastActiveAt;
		},
		get introComplete() {
			return introComplete;
		},
		get transitioning() {
			return transitioning;
		},
		get isDragging() {
			return isDragging;
		},
		get hasHover() {
			return currentHover !== null;
		},
		get animating() {
			return lastAnimating;
		},
		get physicsActive() {
			return lastPhysicsActive;
		},
		get scrolling() {
			return lastScrollActivity;
		},
		get contextLost() {
			return contextLost;
		},
		get disposed() {
			return disposed;
		},
	};

	// Responsive-adjusted intro end vectors so the last frame of
	// animateMobileIntro matches the pose syncMobileShelfCamera produces.
	const _mobileIntroEndPos = new Vector3();
	const _mobileIntroEndLook = new Vector3();
	function updateMobileIntroEndPose(): void {
		_mobileIntroEndPos.set(MOBILE_POS.x + cachedResponsive.cameraX, MOBILE_POS.y, MOBILE_POS.z);
		_mobileIntroEndLook.set(MOBILE_LOOK.x + cachedResponsive.lookX, MOBILE_LOOK.y, MOBILE_LOOK.z);
	}
	updateMobileIntroEndPose();

	// If user prefers reduced motion, skip the intro animation entirely
	// and place the camera at its final resting position.
	if (prefersReducedMotion() && !introComplete) {
		introComplete = true;
		targetInterval = IDLE_INTERVAL;
		if (currentMode === "desktop") {
			camera.position.copy(DESKTOP_POS);
			camera.lookAt(DESKTOP_LOOK);
		} else {
			syncMobileShelfCamera(0.5);
		}
	}

	function render(now: number): void {
		if (disposed || contextLost) return;
		// A frame can already be queued when the tab is hidden; don't render it.
		// The visibilitychange handler restarts the loop on return to visible.
		if (document.visibilityState === "hidden") return;
		animationId = requestAnimationFrame(render);

		if (!transitioning && targetInterval > 0 && now - lastFrame < targetInterval) return;
		const frameDeltaMs = lastFrame > 0 ? now - lastFrame : 1000 / 60;
		lastFrame = now;

		const animating = tickAnimations(now);
		const physicsDt = Math.min(frameDeltaMs / 1000, 1 / 30);
		const physicsActive = currentMode === "desktop" ? deskPhysics.tick(physicsDt) : false;
		lastAnimating = animating;
		lastPhysicsActive = physicsActive;
		lastScrollActivity = false;
		if (animating || physicsActive) lastActiveAt = now;
		if (animating || physicsActive) {
			dirty = true;
			// Objects moved — shadow maps need recomputing
			renderer.shadowMap.needsUpdate = true;
		}

		if (!introComplete) {
			if (currentMode === "desktop") {
				introComplete = animateIntro(camera, startTime, now);
			} else {
				introComplete = animateMobileIntro(
					camera,
					startTime,
					now,
					_mobileIntroEndPos,
					_mobileIntroEndLook,
				);
				if (introComplete) syncMobileShelfCamera(scrollController?.verticalT ?? 0.5);
			}
			lastActiveAt = now;
			if (introComplete) targetInterval = IDLE_INTERVAL;
			if (currentMode === "desktop") {
				composer.render();
			} else {
				renderer.render(scene, camera);
			}
			return;
		}

		// Section focus glide (desk only)
		if (cameraFocusAnim && currentMode === "desktop" && !transitioning) {
			if (stepCameraFocus(camera, cameraFocusAnim, now, cameraLook)) cameraFocusAnim = null;
			lastActiveAt = now;
			dirty = true;
		}

		// Desktop idle float (skip when user prefers reduced motion or while focused)
		if (
			currentMode === "desktop" &&
			!transitioning &&
			!cameraFocused &&
			!cameraFocusAnim &&
			!prefersReducedMotion()
		) {
			if (idleFloat(camera, now)) dirty = true;
		}

		let scrolling = false;
		if (currentMode === "mobile" && !transitioning && scrollController) {
			// Compute dt from last frame (frame-rate independent)
			const dt =
				lastRenderTime > 0 ? Math.min((now - lastRenderTime) / 1000, MAX_FRAME_DELTA_SEC) : 1 / 60;
			lastRenderTime = now;

			scrolling = scrollController.tick(dt);
			lastScrollActivity = scrolling;
			if (scrolling) lastActiveAt = now;
			if (scrolling) {
				syncMobileShelfCamera(scrollController.verticalT);
				dirty = true;
			}
		}

		// Hover scale lerp
		if (!transitioning) {
			const hoverTargets =
				currentMode === "desktop" ? deskScene?.hoverTargets : shelfScene?.hoverTargets;
			if (hoverTargets) {
				for (const obj of hoverTargets) {
					const target = currentHover?.object === obj ? HOVER_SCALE : 1;
					const delta = target - obj.scale.x;
					if (Math.abs(delta) > CAMERA_DELTA_THRESHOLD) {
						obj.scale.setScalar(
							Math.abs(delta) < HOVER_SNAP_EPSILON ? target : obj.scale.x + delta * HOVER_LERP,
						);
						renderer.shadowMap.needsUpdate = true;
						lastActiveAt = now;
						dirty = true;
					}
				}
			}
		}

		if (!transitioning) {
			labelController.update(currentHover, camera, lastCanvasWidth, lastCanvasHeight);
		} else {
			labelController.update(null, camera, lastCanvasWidth, lastCanvasHeight);
		}

		// Restore idle framerate cap once all activity sources settle and stay
		// quiet for a short grace window. This avoids oscillating between the
		// idle cap and full-rate rendering during bursty trackpad input.
		if (
			targetInterval === 0 &&
			introComplete &&
			!transitioning &&
			!isDragging &&
			!animating &&
			!physicsActive &&
			!scrolling &&
			canRestoreIdle(now)
		) {
			targetInterval = IDLE_INTERVAL;
		}

		if (dirty || transitioning) {
			// Skip the bloom pass when its strength is negligible.
			if (bloomPass.strength > 0.01) {
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
		invalidateCanvasRect();
		updateResponsiveLayout();
		if (!introComplete) updateMobileIntroEndPose();

		applyRenderSettings(currentMode);
		renderer.setSize(width, height, false);
		composer.setPixelRatio(renderer.getPixelRatio());
		composer.setSize(width, height);
		bloomPass.resolution.set(width, height);
		camera.aspect = width / height;
		// Keep the desk's horizontal framing stable on narrow desktop windows.
		// During a transition the FOV is interpolated by the transition tick.
		if (!transitioning) {
			camera.fov = currentMode === "desktop" ? desktopFovForAspect(camera.aspect) : BASE_FOV;
		}
		camera.updateProjectionMatrix();
		if (currentMode === "mobile" && !transitioning) {
			syncMobileShelfCamera(scrollController?.verticalT ?? 0.5);
		}

		// Render immediately so the resized canvas doesn't flash black
		if (bloomPass.strength > 0.01) composer.render();
		else renderer.render(scene, camera);
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
		// Stop transition RAF — same as main loop; otherwise tick() keeps scheduling
		if (transitionAnimationId) {
			cancelAnimationFrame(transitionAnimationId);
			transitionAnimationId = 0;
		}
		// Resolve any in-flight transition promise so the async chain doesn't hang
		if (transitionResolve) {
			transitionResolve();
			transitionResolve = null;
		}
	}

	function onContextRestored(): void {
		if (disposed) return;
		// After context restore ALL GPU resources (textures, buffers, programs)
		// are invalidated per the Khronos WebGL spec. The only safe recovery
		// is a full scene teardown and re-mount with a fresh renderer.
		cleanup();
		options?.onContextRestored?.();
	}

	canvas.addEventListener("webglcontextlost", onContextLost);
	canvas.addEventListener("webglcontextrestored", onContextRestored);

	// ─── Page Visibility API: pause render loop when tab is hidden ──
	function onPageVisibilityChange(): void {
		if (disposed || contextLost) return;
		if (document.visibilityState === "hidden") {
			cancelAnimationFrame(animationId);
		} else {
			lastRenderTime = 0; // Reset to avoid large delta jump
			dirty = true;
			animationId = requestAnimationFrame(render);
		}
	}
	document.addEventListener("visibilitychange", onPageVisibilityChange);

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
		resetCameraFocus();
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
		labelController.update(null, camera, lastCanvasWidth, lastCanvasHeight);
		currentHover = null;

		// Close any open object
		if (openSelection) {
			if (openSelection.mode === "desktop") {
				void openSelection.entity.close();
			} else {
				resetShelfSelection();
			}
			openSelection = null;
		}

		// Smoothly fade bloom to avoid render-path flicker at transition end
		// Bloom is desk-only; it fades across the transition.
		const bloomFrom = bloomPass.strength;
		const bloomTo = target === "desktop" ? BLOOM_STRENGTH : 0;
		bloomPass.strength = bloomFrom;

		// Sync canvas size before building content: the mode switch can fire
		// before this scene's own resize callback has run, leaving
		// lastCanvasWidth stale (which used to skip the guitar pick and
		// circuit board when returning from the shelf).
		handleResize();

		// Lazy-create target wall
		if (target === "desktop") createDeskContent();
		else createShelfContent(target === "mobile");

		// Make both walls visible during transition
		setDeskVisible(true);
		setShelfVisible(true);

		// Shadows are recomputed every frame below: the room rotates under the
		// scene-level lights, so a map computed once would leave shadows painted
		// where they were, then jump into place when the transition ends.
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.needsUpdate = true;
		markSceneActive(); // Full framerate during transition

		// Determine rotation and camera poses
		const fromRotY = room.rotation.y;
		const toRotY = 0;
		writeMobilePose(scrollController?.verticalT ?? 0.5, mobilePosePos, mobilePoseLook);
		const fromPos = currentMode === "desktop" ? camera.position.clone() : mobilePosePos.clone();
		const fromLook = currentMode === "desktop" ? DESKTOP_LOOK.clone() : mobilePoseLook.clone();
		writeMobilePose(0.5, mobilePosePos, mobilePoseLook);
		const toPos = target === "desktop" ? DESKTOP_POS.clone() : mobilePosePos.clone();
		const toLook = target === "desktop" ? DESKTOP_LOOK.clone() : mobilePoseLook.clone();
		const fromFov = camera.fov;
		const toFov =
			target === "desktop" ? desktopFovForAspect(lastCanvasWidth / lastCanvasHeight) : BASE_FOV;

		// Warm-up: render once at the destination pose, then again at the from
		// pose, all within this task — only the last render is composited, so
		// nothing flashes. This compiles the new scene's shaders, uploads its
		// textures and rebuilds shadow maps before the animation clock starts,
		// instead of hitching mid-transition.
		const warmUpRender = () => {
			if (Math.max(bloomFrom, bloomTo) > 0.01) composer.render();
			else renderer.render(scene, camera);
		};
		camera.fov = toFov;
		camera.updateProjectionMatrix();
		lerpCameraPose(camera, toPos, toPos, toLook, toLook, 1);
		warmUpRender();
		camera.fov = fromFov;
		camera.updateProjectionMatrix();
		lerpCameraPose(camera, fromPos, fromPos, fromLook, fromLook, 1);
		warmUpRender();
		dirty = false;

		// Animate transition (or teleport instantly under reduced motion)
		if (prefersReducedMotion()) {
			room.rotation.y = toRotY;
			camera.fov = toFov;
			camera.updateProjectionMatrix();
			lerpCameraPose(camera, toPos, toPos, toLook, toLook, 1);
			bloomPass.strength = bloomTo;
			dirty = true;
		} else {
			await new Promise<void>((resolve) => {
				transitionResolve = resolve;
				let transitionStart = -1;
				const transitionDuration =
					currentMode === "desktop" && target === "mobile"
						? DESKTOP_TO_SHELF_TRANSITION_DURATION
						: TRANSITION_DURATION;

				function tick(): void {
					if (disposed || contextLost) {
						transitionAnimationId = 0;
						resolve();
						return;
					}

					const now = performance.now();
					// Anchor the clock to the first animation frame so setup work
					// before this rAF fired doesn't consume the ease-in.
					if (transitionStart < 0) transitionStart = now;
					const elapsed = now - transitionStart;
					const t = Math.min(elapsed / transitionDuration, 1);
					const eased =
						currentMode === "desktop" && target === "mobile" ? easeInOutSine(t) : easeInOutCubic(t);

					// Rotate room
					room.rotation.y = fromRotY + (toRotY - fromRotY) * eased;
					renderer.shadowMap.needsUpdate = true;

					// Interpolate FOV (desktop compensates for narrow aspect ratios)
					camera.fov = fromFov + (toFov - fromFov) * eased;
					camera.updateProjectionMatrix();

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
		}

		// Settle into target mode
		currentMode = target;
		room.rotation.y = toRotY;

		// Hide the wall we're not looking at, then dispose it to free GPU memory
		if (target === "desktop") {
			disposeShelfScene();
			applyRenderSettings("desktop");
			// setPixelRatio clears the canvas buffer — re-sync composer and
			// render immediately so the browser never paints a black frame
			composer.setPixelRatio(renderer.getPixelRatio());
			composer.setSize(lastCanvasWidth, lastCanvasHeight);
			bloomPass.resolution.set(lastCanvasWidth, lastCanvasHeight);
			composer.render();
			markSceneActive();
		} else {
			syncMobileShelfCamera(0.5, [0, 0, 0]);
			disposeDeskScene();
			disposeSpotlightTextures();
			applyRenderSettings("mobile");
			// Keep the bloom buffers at the phone's lower pixel ratio for when
			// the view goes back to the desk.
			composer.setPixelRatio(renderer.getPixelRatio());
			composer.setSize(lastCanvasWidth, lastCanvasHeight);
			bloomPass.resolution.set(lastCanvasWidth, lastCanvasHeight);
			renderer.render(scene, camera);
			markSceneActive();
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

		// Clear pending modal timeout early to prevent stale callbacks
		if (pendingModalTimeout) {
			clearTimeout(pendingModalTimeout);
			pendingModalTimeout = 0;
		}

		canvas.removeEventListener("webglcontextlost", onContextLost);
		canvas.removeEventListener("webglcontextrestored", onContextRestored);
		document.removeEventListener("visibilitychange", onPageVisibilityChange);
		resizeObserver?.disconnect();
		cancelAnimationFrame(animationId);
		if (resizeFrame) cancelAnimationFrame(resizeFrame);
		// Cancel transition animation frame BEFORE resolving the promise
		if (transitionAnimationId) cancelAnimationFrame(transitionAnimationId);
		// Settle any in-flight transition promise so the async chain can GC
		if (transitionResolve) {
			transitionResolve();
			transitionResolve = null;
		}
		if (cleanupInteraction) cleanupInteraction();
		if (cleanupDrag) cleanupDrag();
		if (cleanupMobileShelfControls) cleanupMobileShelfControls();
		cleanupModalClose?.();
		dismissSpotlightPopup();
		cleanupDeskLights?.();
		cleanupShelfLights?.();
		roomLighting?.cleanup();
		shelfScene?.cleanup?.();
		labelController.dispose();
		disposeObjectResources(scene);
		disposeSpotlightTextures();

		resetSharedMaterials();
		disposeAnimations();
		deskPhysics.dispose();
		bloomPass.dispose();
		renderPass.dispose();
		composer.dispose();

		// renderer.dispose() frees all heavy GPU resources (textures, buffers,
		// programs) via GL delete calls. The lightweight context object stays
		// alive so the browser can preserve it through bfcache.
		// MDN WebGL best practices: don't call loseContext() on navigation.
		renderer.dispose();
		delete window.__sceneDebug;
	}

	return { cleanup, transition };
}
