import { type Camera, Mesh, type Object3D, Raycaster, type Scene, Vector2 } from "three";

export interface DeskInteraction {
	href: string;
	label: string;
	object: Object3D;
}

const raycaster = new Raycaster();
const pointer = new Vector2();
let hovered: DeskInteraction | null = null;

function getInteractiveAncestor(obj: Object3D): Object3D | null {
	let current: Object3D | null = obj;
	while (current) {
		if (current.userData?.interactive) return current;
		current = current.parent;
	}
	return null;
}

function collectInteractiveMeshes(scene: Scene): Mesh[] {
	const meshes: Mesh[] = [];
	scene.traverse((child) => {
		if (child.userData?.interactive) {
			child.traverse((desc) => {
				if (desc instanceof Mesh) meshes.push(desc);
			});
		}
	});
	return meshes;
}

function collectInteractiveGroups(scene: Scene): Object3D[] {
	const groups: Object3D[] = [];
	scene.traverse((child) => {
		if (child.userData?.interactive) groups.push(child);
	});
	return groups;
}

export function setupInteraction(
	canvas: HTMLCanvasElement,
	camera: Camera,
	scene: Scene,
	onHover: (interaction: DeskInteraction | null) => void,
	onClick: (interaction: DeskInteraction) => void,
): () => void {
	const interactiveMeshes = collectInteractiveMeshes(scene);
	const interactiveGroups = collectInteractiveGroups(scene);
	let focusIndex = -1;
	let pendingHoverFrame = 0;
	let pointerDownX = 0;
	let pointerDownY = 0;
	const CLICK_THRESHOLD = 6;

	canvas.tabIndex = 0;

	function updatePointer(clientX: number, clientY: number): void {
		const rect = canvas.getBoundingClientRect();
		pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
		pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
	}

	function raycast(): DeskInteraction | null {
		if (interactiveMeshes.length === 0) return null;
		raycaster.setFromCamera(pointer, camera);
		const hits = raycaster.intersectObjects(interactiveMeshes, false);
		if (hits.length === 0) return null;

		const ancestor = getInteractiveAncestor(hits[0].object);
		if (!ancestor) return null;
		return {
			href: ancestor.userData.href,
			label: ancestor.userData.label,
			object: ancestor,
		};
	}

	function setHover(hit: DeskInteraction | null): void {
		if (hit?.href === hovered?.href) return;
		hovered = hit;
		canvas.style.cursor = hit ? "pointer" : "default";
		onHover(hit);
	}

	function requestHoverUpdate(): void {
		if (pendingHoverFrame) return;
		pendingHoverFrame = requestAnimationFrame(() => {
			pendingHoverFrame = 0;
			setHover(raycast());
		});
	}

	function onPointerLeave(): void {
		setHover(null);
	}

	function onPointerMove(e: PointerEvent): void {
		updatePointer(e.clientX, e.clientY);
		requestHoverUpdate();
	}

	function onPointerDown(e: PointerEvent): void {
		pointerDownX = e.clientX;
		pointerDownY = e.clientY;
		if (document.activeElement !== canvas) canvas.focus({ preventScroll: true });
	}

	function onPointerUp(e: PointerEvent): void {
		const dx = e.clientX - pointerDownX;
		const dy = e.clientY - pointerDownY;
		if (dx * dx + dy * dy > CLICK_THRESHOLD * CLICK_THRESHOLD) return;

		updatePointer(e.clientX, e.clientY);
		const hit = raycast();
		if (hit) onClick(hit);
	}

	function onKeydown(e: KeyboardEvent): void {
		if (document.activeElement !== canvas || interactiveGroups.length === 0) return;

		if (e.key === "Tab") {
			e.preventDefault();
			focusIndex =
				(focusIndex + (e.shiftKey ? -1 : 1) + interactiveGroups.length) % interactiveGroups.length;
			const obj = interactiveGroups[focusIndex];
			const next: DeskInteraction = {
				href: obj.userData.href,
				label: obj.userData.label,
				object: obj,
			};
			setHover(next);
		} else if ((e.key === "Enter" || e.key === " ") && hovered) {
			e.preventDefault();
			onClick(hovered);
		}
	}

	canvas.addEventListener("pointerleave", onPointerLeave);
	canvas.addEventListener("pointermove", onPointerMove, { passive: true });
	canvas.addEventListener("pointerdown", onPointerDown);
	canvas.addEventListener("pointerup", onPointerUp);
	window.addEventListener("keydown", onKeydown);

	return () => {
		if (pendingHoverFrame) cancelAnimationFrame(pendingHoverFrame);
		canvas.removeEventListener("pointerleave", onPointerLeave);
		canvas.removeEventListener("pointermove", onPointerMove);
		canvas.removeEventListener("pointerdown", onPointerDown);
		canvas.removeEventListener("pointerup", onPointerUp);
		window.removeEventListener("keydown", onKeydown);
		canvas.style.cursor = "default";
	};
}
