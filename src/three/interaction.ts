import type { Camera, Object3D, Scene } from "three";
import {
	collectGroupsBy,
	collectMeshesBy,
	getAncestorWith,
	pointer,
	raycaster,
	updatePointer,
} from "./raycast-utils";

export interface DeskInteraction {
	href?: string;
	label?: string;
	object: Object3D;
}

let hovered: DeskInteraction | null = null;

export function setupInteraction(
	canvas: HTMLCanvasElement,
	camera: Camera,
	scene: Scene,
	onHover: (interaction: DeskInteraction | null) => void,
	onClick: (interaction: DeskInteraction) => void,
	options?: { enableHover?: boolean },
): () => void {
	const meshes = collectMeshesBy(scene, "interactive");
	const groups = collectGroupsBy(scene, "interactive");
	// Only navigable objects (those with href) are keyboard-focusable
	const navigableGroups = groups.filter((g) => g.userData.href);
	const enableHover = options?.enableHover ?? true;
	let focusIndex = -1;
	let pendingHoverFrame = 0;
	let pointerDownX = 0;
	let pointerDownY = 0;
	const CLICK_THRESHOLD = 6;

	canvas.tabIndex = 0;

	function raycast(): DeskInteraction | null {
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
		updatePointer(canvas, e.clientX, e.clientY);
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
		updatePointer(canvas, e.clientX, e.clientY);
		const hit = raycast();
		if (hit) onClick(hit);
	}

	function onKeydown(e: KeyboardEvent): void {
		if (document.activeElement !== canvas || navigableGroups.length === 0) return;
		if (e.key === "Tab") {
			e.preventDefault();
			focusIndex =
				(focusIndex + (e.shiftKey ? -1 : 1) + navigableGroups.length) % navigableGroups.length;
			const obj = navigableGroups[focusIndex];
			setHover({ href: obj.userData.href, label: obj.userData.label, object: obj });
		} else if ((e.key === "Enter" || e.key === " ") && hovered) {
			e.preventDefault();
			onClick(hovered);
		}
	}

	const onPointerLeave = () => {
		if (!enableHover) return;
		setHover(null);
	};

	canvas.addEventListener("pointerleave", onPointerLeave);
	canvas.addEventListener("pointermove", onPointerMove, { passive: true });
	canvas.addEventListener("pointerdown", onPointerDown);
	canvas.addEventListener("pointerup", onPointerUp);
	window.addEventListener("keydown", onKeydown);

	return () => {
		if (pendingHoverFrame) cancelAnimationFrame(pendingHoverFrame);
		hovered = null;
		canvas.removeEventListener("pointerleave", onPointerLeave);
		canvas.removeEventListener("pointermove", onPointerMove);
		canvas.removeEventListener("pointerdown", onPointerDown);
		canvas.removeEventListener("pointerup", onPointerUp);
		window.removeEventListener("keydown", onKeydown);
		canvas.style.cursor = "default";
	};
}
