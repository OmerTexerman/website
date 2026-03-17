import {
	Color,
	FogExp2,
	type Material,
	Mesh,
	type Object3D,
	Scene,
	Vector2,
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
	animateSpin,
	animateWobble,
	disposeAnimations,
	tickAnimations,
} from "./animations";
import { animateIntro, createCamera, idleFloat } from "./camera";
import { createDesk } from "./desk";
import { addStaticObstacle, disposePhysics, setupDrag, tickPhysics } from "./drag";
import { addHitbox } from "./hitbox";
import { type DeskInteraction, setupInteraction } from "./interaction";
import { disposeLabels, initLabels, updateLabel } from "./labels";
import { setupLighting } from "./lighting";
import { disposeMaterials } from "./materials";
import { createBookStack } from "./objects/book-stack";
import { createCircuitBoard } from "./objects/circuit-board";
import { createDeskLamp, toggleLamp } from "./objects/desk-lamp";
import { createGuitarPick } from "./objects/guitar-pick";
import { attachLaptopEffects, createLaptop } from "./objects/laptop";
import { createMug } from "./objects/mug";
import { createNotebook } from "./objects/notebook";
import { createPen } from "./objects/pen";
import { createPhotoFrame } from "./objects/photo-frame";

const MOBILE_BREAKPOINT = 768;
const HOVER_SCALE = 1.05;
const HOVER_LERP = 0.16;
const CLICK_COOLDOWN_MS = 420;

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

interface DeskModal {
	open: (label: string, href: string) => void;
	close: () => void;
	onClose: (cb: () => void) => void;
}

function getModal(): DeskModal | null {
	if (typeof window !== "undefined" && "__deskModal" in window) {
		return (window as Window & { __deskModal: DeskModal }).__deskModal;
	}
	return null;
}

function trackEvent(event: string, props: Record<string, string>): void {
	const w = window as Window & {
		posthog?: { capture: (e: string, p: Record<string, string>) => void };
	};
	w.posthog?.capture(event, props);
}

export function initDeskScene(canvas: HTMLCanvasElement, labelContainer: HTMLElement): () => void {
	const scene = new Scene();
	scene.background = new Color("#1e1e1e");
	scene.fog = new FogExp2(new Color("#1e1e1e"), 0.04);

	const mobile = window.innerWidth < MOBILE_BREAKPOINT;
	const pixelRatio = Math.min(window.devicePixelRatio, mobile ? 1 : 2);

	const renderer = new WebGLRenderer({
		canvas,
		antialias: !mobile,
		powerPreference: "high-performance",
	});
	renderer.setPixelRatio(pixelRatio);
	renderer.setSize(canvas.clientWidth, canvas.clientHeight);
	renderer.shadowMap.enabled = !mobile;

	const camera = createCamera(canvas.clientWidth / canvas.clientHeight);

	// Post-processing — bloom for screen glow
	const composer = new EffectComposer(renderer);
	const renderPass = new RenderPass(scene, camera);
	composer.addPass(renderPass);
	const bloomPass = new UnrealBloomPass(
		new Vector2(canvas.clientWidth, canvas.clientHeight),
		0.6, // strength — visible glow from screen
		0.8, // radius — wide halo spread
		0.7, // threshold — only bright emissives bloom
	);
	composer.addPass(bloomPass);

	// Build scene
	setupLighting(scene);
	scene.add(createDesk());
	const deskLamp = createDeskLamp();
	scene.add(deskLamp);

	const notebook = createNotebook();
	const laptop = createLaptop();
	const bookStack = createBookStack();
	const photoFrame = createPhotoFrame();
	scene.add(notebook);
	scene.add(laptop);
	scene.add(bookStack);
	scene.add(photoFrame);

	const mug = createMug();
	const pen = createPen();
	scene.add(mug);
	scene.add(pen);
	if (!mobile) {
		scene.add(createGuitarPick());
		scene.add(createCircuitBoard());
	}

	addHitbox(notebook, 0.1);
	addHitbox(laptop, 0.1);
	addHitbox(bookStack, 0.1);
	addHitbox(photoFrame, 0.15);
	addHitbox(deskLamp, 0.05);

	addStaticObstacle(notebook, 0.5);
	addStaticObstacle(laptop, 0.6);
	addStaticObstacle(bookStack, 0.45);
	addStaticObstacle(deskLamp, 0.2);

	// Attach light effects after hitboxes so they don't inflate bounding boxes
	attachLaptopEffects(laptop);

	initLabels(labelContainer);

	// State
	let dirty = true;
	let isDragging = false;
	let introComplete = false;
	let currentHover: DeskInteraction | null = null;
	let openObject: { label: string; object: Object3D } | null = null;
	let clickLockedUntil = 0;
	const interactiveObjects = [notebook, laptop, bookStack, photoFrame, deskLamp];

	// Micro-interactions: clickable objects that don't navigate
	const microInteractions = new Map<Object3D, () => void>();
	microInteractions.set(deskLamp, () => toggleLamp(deskLamp));
	microInteractions.set(mug, () => animateWobble(mug));
	microInteractions.set(pen, () => animateSpin(pen));

	const cleanupDrag = setupDrag(
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

	const cleanupInteraction = setupInteraction(
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

			// Micro-interaction (no href) — fire registered handler
			if (!interaction.href) {
				const handler = microInteractions.get(interaction.object);
				if (handler) {
					clickLockedUntil = performance.now() + 200;
					handler();
					dirty = true;
				}
				return;
			}

			// Navigation interaction — href and label guaranteed by the guard above
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

			setTimeout(() => {
				const modal = getModal();
				if (modal) modal.open(label, href);
				else window.location.href = href;
			}, 350);

			trackEvent("desk_object_click", { label, href });
		},
	);

	const modal = getModal();
	modal?.onClose(() => {
		if (openObject) {
			CLOSE_ANIMATIONS[openObject.label]?.(openObject.object);
			openObject = null;
		}
	});

	// Render loop
	const startTime = performance.now();
	let animationId: number;
	let lastFrame = 0;
	const targetInterval = mobile ? 1000 / 30 : 0;

	function render(now: number): void {
		animationId = requestAnimationFrame(render);

		if (targetInterval > 0 && now - lastFrame < targetInterval) return;
		lastFrame = now;

		const animating = tickAnimations(now);
		const physicsActive = tickPhysics(1 / 60);
		if (animating || physicsActive) dirty = true;

		if (!introComplete) {
			introComplete = animateIntro(camera, startTime, now);
			composer.render();
			return;
		}

		if (idleFloat(camera, now)) dirty = true;

		// Hover scale lerp — runs even when unhovered to animate back to 1
		for (const obj of interactiveObjects) {
			const target = currentHover?.object === obj ? HOVER_SCALE : 1;
			const delta = target - obj.scale.x;
			if (Math.abs(delta) > 0.001) {
				obj.scale.setScalar(obj.scale.x + delta * HOVER_LERP);
				dirty = true;
			}
		}

		updateLabel(currentHover, camera, canvas);

		if (dirty) {
			composer.render();
			dirty = false;
		}
	}

	animationId = requestAnimationFrame(render);

	function handleResize(): void {
		renderer.setSize(canvas.clientWidth, canvas.clientHeight);
		composer.setSize(canvas.clientWidth, canvas.clientHeight);
		bloomPass.resolution.set(canvas.clientWidth, canvas.clientHeight);
		camera.aspect = canvas.clientWidth / canvas.clientHeight;
		camera.updateProjectionMatrix();
		dirty = true;
	}

	window.addEventListener("resize", handleResize);

	return () => {
		window.removeEventListener("resize", handleResize);
		cancelAnimationFrame(animationId);
		cleanupInteraction();
		cleanupDrag();
		disposeLabels();

		scene.traverse((child) => {
			if (child instanceof Mesh) {
				child.geometry.dispose();
				if (Array.isArray(child.material)) {
					for (const m of child.material as Material[]) m.dispose();
				} else {
					(child.material as Material).dispose();
				}
			}
		});

		disposeAnimations();
		disposePhysics();
		disposeMaterials();
		renderer.dispose();
	};
}
