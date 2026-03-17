import {
	Color,
	FogExp2,
	Light,
	type Material,
	Mesh,
	type Object3D,
	Scene,
	WebGLRenderer,
} from "three";
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
import { createCamera, idleFloat } from "./camera";
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

const AMBIENT_STATES = [
	{ name: "Night", background: "#1e1e1e", fog: "#1e1e1e", fogDensity: 0.04, lightMultiplier: 1 },
	{
		name: "Sunset",
		background: "#2a1e1a",
		fog: "#2a1e1a",
		fogDensity: 0.035,
		lightMultiplier: 1.18,
	},
	{ name: "Focus", background: "#152028", fog: "#152028", fogDensity: 0.03, lightMultiplier: 0.9 },
] as const;

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

function createDeskSound() {
	let enabled = false;
	let ctx: AudioContext | null = null;
	let lastHoverAt = 0;

	function ensureContext(): AudioContext | null {
		if (!enabled) return null;
		if (!ctx) {
			const Ctx =
				window.AudioContext ||
				(window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
			if (!Ctx) return null;
			ctx = new Ctx();
		}
		if (ctx.state === "suspended") {
			ctx.resume();
		}
		return ctx;
	}

	function blip(freq: number, duration = 0.08, volume = 0.025): void {
		const audio = ensureContext();
		if (!audio) return;
		const osc = audio.createOscillator();
		const gain = audio.createGain();
		osc.type = "sine";
		osc.frequency.value = freq;
		gain.gain.value = 0;
		osc.connect(gain);
		gain.connect(audio.destination);
		const t = audio.currentTime;
		gain.gain.setValueAtTime(0.0001, t);
		gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
		gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
		osc.start(t);
		osc.stop(t + duration + 0.01);
	}

	return {
		toggle() {
			enabled = !enabled;
			if (enabled) blip(660, 0.06, 0.02);
			return enabled;
		},
		playHover() {
			const now = performance.now();
			if (now - lastHoverAt < 120) return;
			lastHoverAt = now;
			blip(540, 0.05, 0.012);
		},
		playClick() {
			blip(440, 0.09, 0.02);
			setTimeout(() => blip(660, 0.08, 0.016), 45);
		},
		playClose() {
			blip(320, 0.08, 0.015);
		},
		dispose() {
			if (ctx) ctx.close();
			ctx = null;
		},
	};
}

export function initDeskScene(canvas: HTMLCanvasElement, labelContainer: HTMLElement): () => void {
	const scene = new Scene();
	scene.background = new Color(AMBIENT_STATES[0].background);
	scene.fog = new FogExp2(new Color(AMBIENT_STATES[0].fog), AMBIENT_STATES[0].fogDensity);

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
	const mug = createMug();
	const pen = createPen();
	scene.add(notebook, laptop, bookStack, photoFrame, mug, pen);

	let guitarPick: Object3D | null = null;
	if (!mobile) {
		guitarPick = createGuitarPick();
		scene.add(guitarPick, createCircuitBoard());
	}

	addHitbox(notebook, 0.1);
	addHitbox(laptop, 0.1);
	addHitbox(bookStack, 0.1);
	addHitbox(photoFrame, 0.15);

	addStaticObstacle(notebook, 0.5);
	addStaticObstacle(laptop, 0.6);
	addStaticObstacle(bookStack, 0.45);
	addStaticObstacle(deskLamp, 0.2);

	initLabels(labelContainer);

	const ambientBaseIntensities = new Map<Light, number>();
	function applyAmbientState(index: number): number {
		const normalized = (index + AMBIENT_STATES.length) % AMBIENT_STATES.length;
		const state = AMBIENT_STATES[normalized];
		scene.background = new Color(state.background);
		scene.fog = new FogExp2(new Color(state.fog), state.fogDensity);
		scene.traverse((node) => {
			if (node instanceof Light) {
				if (!ambientBaseIntensities.has(node)) ambientBaseIntensities.set(node, node.intensity);
				node.intensity = (ambientBaseIntensities.get(node) ?? 1) * state.lightMultiplier;
			}
		});
		window.dispatchEvent(
			new CustomEvent("desk:ambient-changed", { detail: { ...state, index: normalized } }),
		);
		return normalized;
	}

	let ambientIndex = applyAmbientState(0);
	const sound = createDeskSound();

	const microObjects = [
		{ object: mug, amp: 0.025, speed: 0.0018, axis: "z" as const },
		{ object: pen, amp: 0.03, speed: 0.0015, axis: "x" as const },
		{ object: deskLamp, amp: 0.018, speed: 0.0012, axis: "z" as const },
		...(guitarPick ? [{ object: guitarPick, amp: 0.05, speed: 0.0024, axis: "y" as const }] : []),
	];
	const baseRotations = new Map<Object3D, { x: number; y: number; z: number }>();
	for (const item of microObjects) {
		baseRotations.set(item.object, {
			x: item.object.rotation.x,
			y: item.object.rotation.y,
			z: item.object.rotation.z,
		});
	}

	let dirty = true;
	let isDragging = false;
	let currentHover: DeskInteraction | null = null;
	let openObject: { label: string; object: Object3D } | null = null;

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
			if (currentHover && currentHover.object !== interaction?.object) {
				currentHover.object.scale.set(1, 1, 1);
			}
			if (interaction) {
				interaction.object.scale.set(1.05, 1.05, 1.05);
				if (interaction.href !== currentHover?.href) sound.playHover();
			}
			currentHover = interaction;
			updateLabel(interaction, camera, canvas);
			dirty = true;
		},
		(interaction) => {
			if (isDragging) return;
			if (openObject?.label === interaction.label) return;

			if (openObject) {
				const closeFn = CLOSE_ANIMATIONS[openObject.label];
				if (closeFn) closeFn(openObject.object);
			}

			openObject = { label: interaction.label, object: interaction.object };
			const animFn = OPEN_ANIMATIONS[interaction.label];
			if (animFn) animFn(interaction.object);
			sound.playClick();

			setTimeout(() => {
				const modal = getModal();
				if (modal) {
					modal.open(interaction.label, interaction.href);
				} else {
					window.location.href = interaction.href;
				}
			}, 350);
		},
	);

	const onAmbientCycle = () => {
		ambientIndex = applyAmbientState(ambientIndex + 1);
		dirty = true;
	};
	const onSoundToggle = () => {
		const enabled = sound.toggle();
		window.dispatchEvent(new CustomEvent("desk:sound-changed", { detail: { enabled } }));
	};
	window.addEventListener("desk:ambient-cycle", onAmbientCycle);
	window.addEventListener("desk:sound-toggle", onSoundToggle);

	const modal = getModal();
	if (modal) {
		modal.onClose(() => {
			if (openObject) {
				const closeFn = CLOSE_ANIMATIONS[openObject.label];
				if (closeFn) closeFn(openObject.object);
				openObject = null;
				sound.playClose();
			}
		});
	}

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

		idleFloat(camera, now);

		for (const item of microObjects) {
			const base = baseRotations.get(item.object);
			if (!base) continue;
			const wave = Math.sin(now * item.speed) * item.amp;
			if (item.axis === "x") item.object.rotation.x = base.x + wave;
			if (item.axis === "y") item.object.rotation.y = base.y + wave;
			if (item.axis === "z") item.object.rotation.z = base.z + wave;
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
		window.removeEventListener("desk:ambient-cycle", onAmbientCycle);
		window.removeEventListener("desk:sound-toggle", onSoundToggle);
		cancelAnimationFrame(animationId);
		cleanupInteraction();
		cleanupDrag();
		disposeLabels();
		sound.dispose();

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
