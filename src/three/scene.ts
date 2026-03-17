import { Color, FogExp2, type Material, Mesh, type Object3D, Scene, WebGLRenderer } from "three";
import {
	animateBookClose,
	animateBookLift,
	animateFrameClose,
	animateFrameReveal,
	animateLaptopClose,
	animateLaptopOpen,
	animateNotebookClose,
	animateNotebookOpen,
	tickAnimations,
} from "./animations";
import { animateIntro, createCamera, idleFloat } from "./camera";
import { createDesk } from "./desk";
import { addStaticObstacle, setupDrag, tickPhysics } from "./drag";
import { addHitbox } from "./hitbox";
import { type DeskInteraction, setupInteraction } from "./interaction";
import { disposeLabels, initLabels, updateLabel } from "./labels";
import { setupLighting } from "./lighting";
import { disposeMaterials } from "./materials";
import { createBookStack } from "./objects/book-stack";
import { createCircuitBoard } from "./objects/circuit-board";
import { createDeskLamp } from "./objects/desk-lamp";
import { createGuitarPick } from "./objects/guitar-pick";
import { createLaptop } from "./objects/laptop";
import { createMug } from "./objects/mug";
import { createNotebook } from "./objects/notebook";
import { createPen } from "./objects/pen";
import { createPhotoFrame } from "./objects/photo-frame";

const isMobile = (): boolean => typeof window !== "undefined" && window.innerWidth < 768;

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

const HOVER_SCALE = 1.05;
const HOVER_LERP = 0.16;
const CLICK_COOLDOWN_MS = 420;

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

export function initDeskScene(canvas: HTMLCanvasElement, labelContainer: HTMLElement): () => void {
	const scene = new Scene();
	scene.background = new Color("#1e1e1e");
	scene.fog = new FogExp2(new Color("#1e1e1e"), 0.04);

	const mobile = isMobile();
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

	scene.add(createMug());
	scene.add(createPen());
	if (!mobile) {
		scene.add(createGuitarPick());
		scene.add(createCircuitBoard());
	}

	// Add invisible hitboxes for forgiving click targets
	addHitbox(notebook, 0.1);
	addHitbox(laptop, 0.1);
	addHitbox(bookStack, 0.1);
	addHitbox(photoFrame, 0.15);

	// Register interactive objects as static collision obstacles
	addStaticObstacle(notebook, 0.5);
	addStaticObstacle(laptop, 0.6);
	addStaticObstacle(bookStack, 0.45);
	addStaticObstacle(deskLamp, 0.2);

	initLabels(labelContainer);

	let dirty = true;
	let isDragging = false;
	let introComplete = false;
	let currentHover: DeskInteraction | null = null;
	let openObject: { label: string; object: Object3D } | null = null;
	let clickLockedUntil = 0;
	const interactiveObjects = [notebook, laptop, bookStack, photoFrame];

	const cleanupDrag = setupDrag(canvas, camera, scene, (dragging) => {
		isDragging = dragging;
		dirty = true;
	});

	const cleanupInteraction = setupInteraction(
		canvas,
		camera,
		scene,
		(interaction) => {
			if (isDragging) return;
			currentHover = interaction;
			updateLabel(interaction, camera, canvas);
			dirty = true;
		},
		(interaction) => {
			if (isDragging || !introComplete) return;
			if (performance.now() < clickLockedUntil) return;
			// Don't re-trigger if already open
			if (openObject?.label === interaction.label) return;

			clickLockedUntil = performance.now() + CLICK_COOLDOWN_MS;

			// Close previously open object first
			if (openObject) {
				const closeFn = CLOSE_ANIMATIONS[openObject.label];
				if (closeFn) closeFn(openObject.object);
			}

			openObject = { label: interaction.label, object: interaction.object };

			const animFn = OPEN_ANIMATIONS[interaction.label];
			if (animFn) animFn(interaction.object);

			setTimeout(() => {
				const modal = getModal();
				if (modal) {
					modal.open(interaction.label, interaction.href);
				} else {
					window.location.href = interaction.href;
				}
			}, 350);

			if (typeof window !== "undefined" && "posthog" in window) {
				const ph = (
					window as Window & {
						posthog: {
							capture: (event: string, props: Record<string, string>) => void;
						};
					}
				).posthog;
				ph.capture("desk_object_click", {
					label: interaction.label,
					href: interaction.href,
				});
			}
		},
	);

	// Listen for modal close to reverse animation
	const modal = getModal();
	if (modal) {
		modal.onClose(() => {
			if (openObject) {
				const closeFn = CLOSE_ANIMATIONS[openObject.label];
				if (closeFn) closeFn(openObject.object);
				openObject = null;
			}
		});
	}

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
			renderer.render(scene, camera);
			return;
		}

		idleFloat(camera, now);

		for (const obj of interactiveObjects) {
			const target = currentHover?.object === obj ? HOVER_SCALE : 1;
			const next = obj.scale.x + (target - obj.scale.x) * HOVER_LERP;
			if (Math.abs(next - obj.scale.x) > 0.0005) dirty = true;
			obj.scale.setScalar(next);
		}

		if (dirty || currentHover) {
			if (currentHover) updateLabel(currentHover, camera, canvas);
			dirty = false;
		}

		renderer.render(scene, camera);
	}

	animationId = requestAnimationFrame(render);

	function handleResize(): void {
		renderer.setSize(canvas.clientWidth, canvas.clientHeight);
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

		disposeMaterials();
		renderer.dispose();
	};
}
