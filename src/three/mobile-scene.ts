import {
	AmbientLight,
	Color,
	type Material,
	Mesh,
	MeshStandardMaterial,
	type Object3D,
	PerspectiveCamera,
	PlaneGeometry,
	PointLight,
	Scene,
	Vector3,
	WebGLRenderer,
} from "three";
import { disposeAnimations, easeInOutCubic, tickAnimations } from "./animations";
import { addHitbox } from "./hitbox";
import { type DeskInteraction, setupInteraction } from "./interaction";
import { disposeMaterials } from "./materials";
import { createVendingMachine } from "./objects/vending-machine";

// ─── Camera ─────────────────────────────────────────────────────
const MACHINE_CENTER_Y = 2.5;
const START_POS = new Vector3(3, MACHINE_CENTER_Y + 2, 12);
const END_POS = new Vector3(1.8, MACHINE_CENTER_Y + 0.3, 8);
const LOOK_AT = new Vector3(-0.1, MACHINE_CENTER_Y, 0);
const INTRO_DURATION = 2000;

function createCamera(aspect: number): PerspectiveCamera {
	const fov = aspect < 1 ? 48 : 40;
	const cam = new PerspectiveCamera(fov, aspect, 0.1, 50);
	cam.position.copy(START_POS);
	cam.lookAt(LOOK_AT);
	return cam;
}

function animateIntro(cam: PerspectiveCamera, startTime: number, now: number): boolean {
	const p = Math.min((now - startTime) / INTRO_DURATION, 1);
	const e = easeInOutCubic(p);
	cam.position.lerpVectors(START_POS, END_POS, e);
	cam.lookAt(LOOK_AT);
	return p >= 1;
}

// ─── Animation helpers ──────────────────────────────────────────
interface ActiveAnim {
	id: string;
	start: number;
	duration: number;
	update: (p: number) => void;
	resolve: () => void;
}

const localAnims: ActiveAnim[] = [];

function animateLocal(id: string, duration: number, update: (p: number) => void): Promise<void> {
	// Cancel existing with same id
	for (let i = localAnims.length - 1; i >= 0; i--) {
		if (localAnims[i].id === id) {
			localAnims[i].resolve();
			localAnims.splice(i, 1);
		}
	}
	return new Promise((resolve) => {
		localAnims.push({ id, start: performance.now(), duration, update, resolve });
	});
}

function tickLocal(now: number): boolean {
	let any = false;
	for (let i = localAnims.length - 1; i >= 0; i--) {
		const a = localAnims[i];
		const p = Math.min((now - a.start) / a.duration, 1);
		a.update(easeInOutCubic(p));
		if (p >= 1) {
			a.resolve();
			localAnims.splice(i, 1);
		} else {
			any = true;
		}
	}
	return any;
}

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

// ─── Modal access ───────────────────────────────────────────────
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

// ─── Scene ──────────────────────────────────────────────────────
export interface BookData {
	title: string;
	spineColor: string;
}

export function initMobileScene(
	canvas: HTMLCanvasElement,
	sections: { label: string; href: string }[],
	labelContainer?: HTMLElement,
	books?: BookData[],
): () => void {
	const scene = new Scene();
	scene.background = new Color("#1e1e1e");

	const renderer = new WebGLRenderer({
		canvas,
		antialias: false,
		powerPreference: "low-power",
	});
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
	renderer.setSize(canvas.clientWidth, canvas.clientHeight);
	renderer.shadowMap.enabled = false;

	const camera = createCamera(canvas.clientWidth / canvas.clientHeight);

	// Lighting — even and bright, no hotspots
	scene.add(new AmbientLight(new Color("#dddddd"), 4.0));
	// Front light centered on the machine
	const front = new PointLight(new Color("#ffffff"), 3.0, 30, 1.0);
	front.position.set(0, 1.5, 6);
	scene.add(front);
	// Top-down fill to illuminate lower shelves
	const top = new PointLight(new Color("#ffe8cc"), 2.0, 20, 1.5);
	top.position.set(0, 4, 2);
	scene.add(top);

	// Ground plane — subtle dark surface to ground the machine
	const groundGeo = new PlaneGeometry(12, 12);
	const groundMat = new MeshStandardMaterial({ color: new Color("#181818"), roughness: 0.9 });
	const ground = new Mesh(groundGeo, groundMat);
	ground.rotation.x = -Math.PI / 2;
	ground.position.y = -1.5;
	scene.add(ground);

	// Build vending machine
	const { machine, compartments, items } = createVendingMachine(sections, books);
	scene.add(machine);

	// Hitboxes for tap detection
	for (const comp of compartments) {
		addHitbox(comp, 0.05);
	}

	// Store original item Y positions for return animation
	const restYs = items.map((item) => item.position.y);
	const PICKUP_Y = -0.2; // world Y of pickup slot (machine shifted up by 1)

	let dirty = true;
	let introComplete = false;
	let openObject: { label: string; object: Object3D; itemIndex: number } | null = null;

	const cleanupInteraction = setupInteraction(
		canvas,
		camera,
		scene,
		() => {
			dirty = true;
		},
		(interaction: DeskInteraction) => {
			if (!introComplete) return;
			if (!interaction.href || !interaction.label) return;
			if (openObject?.label === interaction.label) return;

			// Close previous
			if (openObject) {
				const prevItem = items[openObject.itemIndex];
				const prevRestY = restYs[openObject.itemIndex];
				const curY = prevItem.position.y;
				animateLocal(`return-${openObject.itemIndex}`, 300, (p) => {
					prevItem.position.y = lerp(curY, prevRestY, p);
				});
			}

			const compIndex = compartments.indexOf(interaction.object);
			if (compIndex < 0) return;

			openObject = { label: interaction.label, object: interaction.object, itemIndex: compIndex };

			const item = items[compIndex];
			const startY = item.position.y;
			const parentY = compartments[compIndex].position.y;
			const dropTarget = PICKUP_Y - parentY; // local Y to reach pickup slot

			animateLocal(`drop-${compIndex}`, 450, (p) => {
				// Drop with overshoot bounce
				const drop = lerp(startY, dropTarget, p);
				const bounce = p >= 0.85 ? Math.sin(((p - 0.85) / 0.15) * Math.PI) * 0.06 : 0;
				item.position.y = drop + bounce;
			});

			dirty = true;

			const { label: navLabel, href: navHref } = interaction as { label: string; href: string };
			setTimeout(() => {
				const modal = getModal();
				if (modal) modal.open(navLabel, navHref);
				else window.location.href = navHref;
			}, 400);
		},
	);

	// Modal close → return item
	const modal = getModal();
	modal?.onClose(() => {
		if (openObject) {
			const item = items[openObject.itemIndex];
			const restY = restYs[openObject.itemIndex];
			const curY = item.position.y;
			animateLocal(`return-${openObject.itemIndex}`, 350, (p) => {
				item.position.y = lerp(curY, restY, p);
			});
			openObject = null;
			dirty = true;
		}
	});

	// ─── Compartment labels (HTML overlay) ──────────────────────
	const labelEls: HTMLElement[] = [];

	if (labelContainer) {
		for (const section of sections) {
			const el = document.createElement("div");
			el.textContent = section.label;
			Object.assign(el.style, {
				position: "absolute",
				pointerEvents: "none",
				fontFamily: "'Space Grotesk', sans-serif",
				fontSize: "0.65rem",
				fontWeight: "600",
				letterSpacing: "0.1em",
				textTransform: "uppercase",
				color: "rgba(240, 236, 228, 0.75)",
				opacity: "0",
				transition: "opacity 0.6s ease",
				whiteSpace: "nowrap",
			});
			labelContainer.appendChild(el);
			labelEls.push(el);
		}
	}

	const _labelPos = new Vector3();

	function positionLabels(): void {
		if (!labelContainer || labelEls.length === 0) return;
		for (let i = 0; i < compartments.length; i++) {
			const comp = compartments[i];
			comp.getWorldPosition(_labelPos);
			_labelPos.project(camera);
			const y = (-_labelPos.y * 0.5 + 0.5) * canvas.clientHeight;
			const el = labelEls[i];
			// Pin to left edge of screen with padding
			el.style.left = "12px";
			el.style.top = `${y}px`;
			el.style.transform = "translateY(-50%)";
			el.style.opacity = "1";
		}
	}

	// Render loop
	const startTime = performance.now();
	let animationId: number;
	let labelsPositioned = false;

	function render(now: number): void {
		animationId = requestAnimationFrame(render);

		const animating = tickAnimations(now) || tickLocal(now);
		if (animating) dirty = true;

		if (!introComplete) {
			introComplete = animateIntro(camera, startTime, now);
			renderer.render(scene, camera);
			if (introComplete && !labelsPositioned) {
				labelsPositioned = true;
				positionLabels();
			}
			return;
		}

		if (dirty) {
			renderer.render(scene, camera);
			dirty = false;
		}
	}

	animationId = requestAnimationFrame(render);

	function handleResize(): void {
		renderer.setSize(canvas.clientWidth, canvas.clientHeight);
		camera.aspect = canvas.clientWidth / canvas.clientHeight;
		camera.updateProjectionMatrix();
		dirty = true;
		if (labelsPositioned) positionLabels();
	}

	window.addEventListener("resize", handleResize);

	return () => {
		window.removeEventListener("resize", handleResize);
		cancelAnimationFrame(animationId);
		cleanupInteraction();
		for (const el of labelEls) el.remove();

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
		localAnims.length = 0;
		disposeMaterials();
		renderer.dispose();
	};
}
