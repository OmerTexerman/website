import { type Camera, type Object3D, Raycaster, type Scene, Vector2 } from "three";
import { CLICK_DISTANCE_THRESHOLD } from "./constants";
import { collectGroupsBy, collectMeshesBy, getAncestorWith, updatePointer } from "./raycast-utils";

export interface DeskInteraction {
	href?: string;
	label?: string;
	object: Object3D;
}

interface InteractionPicker {
	getInteractionAt(clientX: number, clientY: number): DeskInteraction | null;
}

export function createInteractionPicker(
	canvas: HTMLCanvasElement,
	camera: Camera,
	scene: Scene,
): InteractionPicker {
	const meshes = collectMeshesBy(scene, "interactive");
	const pointer = new Vector2();
	const raycaster = new Raycaster();

	function getInteractionAt(clientX: number, clientY: number): DeskInteraction | null {
		updatePointer(pointer, canvas, clientX, clientY);
		raycaster.setFromCamera(pointer, camera);
		const hits = raycaster.intersectObjects(meshes, false);
		if (hits.length === 0) return null;
		const ancestor = getAncestorWith(hits[0].object, "interactive");
		if (!ancestor) return null;
		return {
			href: ancestor.userData.href,
			label: ancestor.userData.label,
			object: ancestor,
		};
	}

	return { getInteractionAt };
}

export function setupInteraction(
	canvas: HTMLCanvasElement,
	camera: Camera,
	scene: Scene,
	onHover: (interaction: DeskInteraction | null) => void,
	onClick: (interaction: DeskInteraction) => void,
	options?: {
		enableHover?: boolean;
		enablePointerClick?: boolean;
		onTabNavigate?: (interaction: DeskInteraction) => void;
		focusOnPointerDown?: boolean;
	},
): () => void {
	const picker = createInteractionPicker(canvas, camera, scene);
	const groups = collectGroupsBy(scene, "interactive");
	// Only navigable objects (those with href) are keyboard-focusable
	const navigableGroups = groups.filter((g) => g.userData.href);
	const enableHover = options?.enableHover ?? true;
	const enablePointerClick = options?.enablePointerClick ?? true;
	const focusOnPointerDown = options?.focusOnPointerDown ?? true;
	let hovered: DeskInteraction | null = null;
	let focusIndex = -1;
	let pendingHoverFrame = 0;
	let pointerX = 0;
	let pointerY = 0;
	let pointerDownX = 0;
	let pointerDownY = 0;
	const CLICK_THRESHOLD = CLICK_DISTANCE_THRESHOLD;

	const previousTabIndex = canvas.getAttribute("tabindex");
	canvas.tabIndex = 0;
	const previousTouchAction = canvas.style.touchAction;
	canvas.style.touchAction = "none";
	const shouldHandlePointerDown = focusOnPointerDown || enablePointerClick || enableHover;

	function raycast(): DeskInteraction | null {
		return picker.getInteractionAt(pointerX, pointerY);
	}

	function setHover(hit: DeskInteraction | null): void {
		if (hit?.object === hovered?.object) return;
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

	function onPointerMove(e: PointerEvent): void {
		if (!enableHover) return;
		pointerX = e.clientX;
		pointerY = e.clientY;
		requestHoverUpdate();
	}

	function onPointerDown(e: PointerEvent): void {
		pointerX = e.clientX;
		pointerY = e.clientY;
		pointerDownX = e.clientX;
		pointerDownY = e.clientY;
		if (focusOnPointerDown && document.activeElement !== canvas) {
			canvas.focus({ preventScroll: true });
		}
	}

	function onPointerUp(e: PointerEvent): void {
		if (!enablePointerClick) return;
		const dx = e.clientX - pointerDownX;
		const dy = e.clientY - pointerDownY;
		if (dx * dx + dy * dy > CLICK_THRESHOLD * CLICK_THRESHOLD) return;
		const hit = picker.getInteractionAt(e.clientX, e.clientY);
		if (hit) onClick(hit);
	}

	function onKeydown(e: KeyboardEvent): void {
		if (document.activeElement !== canvas || navigableGroups.length === 0) return;
		if (e.key === "Escape") {
			canvas.blur();
			return;
		}
		if (e.key === "Tab") {
			e.preventDefault();
			focusIndex =
				(focusIndex + (e.shiftKey ? -1 : 1) + navigableGroups.length) % navigableGroups.length;
			const obj = navigableGroups[focusIndex];
			const interaction: DeskInteraction = {
				href: obj.userData.href,
				label: obj.userData.label,
				object: obj,
			};
			setHover(interaction);
			options?.onTabNavigate?.(interaction);
		} else if ((e.key === "Enter" || e.key === " ") && hovered) {
			e.preventDefault();
			onClick(hovered);
		}
	}

	const onPointerLeave = () => {
		if (!enableHover) return;
		setHover(null);
	};

	if (shouldHandlePointerDown) {
		canvas.addEventListener("pointerdown", onPointerDown);
	}
	if (enableHover) {
		canvas.addEventListener("pointerleave", onPointerLeave);
		canvas.addEventListener("pointermove", onPointerMove, { passive: true });
	}
	if (enablePointerClick) {
		canvas.addEventListener("pointerup", onPointerUp);
	}
	window.addEventListener("keydown", onKeydown);

	return () => {
		if (pendingHoverFrame) cancelAnimationFrame(pendingHoverFrame);
		hovered = null;
		if (shouldHandlePointerDown) {
			canvas.removeEventListener("pointerdown", onPointerDown);
		}
		if (enableHover) {
			canvas.removeEventListener("pointerleave", onPointerLeave);
			canvas.removeEventListener("pointermove", onPointerMove);
		}
		if (enablePointerClick) {
			canvas.removeEventListener("pointerup", onPointerUp);
		}
		window.removeEventListener("keydown", onKeydown);
		if (document.activeElement === canvas) canvas.blur();
		if (previousTabIndex === null) canvas.removeAttribute("tabindex");
		else canvas.setAttribute("tabindex", previousTabIndex);
		canvas.style.cursor = "default";
		canvas.style.touchAction = previousTouchAction;
	};
}
