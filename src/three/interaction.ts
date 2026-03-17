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

/** Collect all Mesh children of interactive groups for raycasting */
function collectInteractiveMeshes(scene: Scene): Mesh[] {
	const meshes: Mesh[] = [];
	scene.traverse((child) => {
		if (child.userData?.interactive) {
			child.traverse((desc) => {
				if (desc instanceof Mesh) {
					meshes.push(desc);
				}
			});
		}
	});
	return meshes;
}

function collectInteractiveGroups(scene: Scene): Object3D[] {
	const result: Object3D[] = [];
	scene.traverse((child) => {
		if (child.userData?.interactive) {
			result.push(child);
		}
	});
	return result;
}

export function setupInteraction(
	canvas: HTMLCanvasElement,
	camera: Camera,
	scene: Scene,
	onHover: (interaction: DeskInteraction | null) => void,
	onClick: (interaction: DeskInteraction) => void,
): () => void {
	let lastHoverEvent = 0;
	const HOVER_THROTTLE = 50;

	function updatePointer(e: MouseEvent | Touch): void {
		const rect = canvas.getBoundingClientRect();
		pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
		pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
	}

	function raycast(): DeskInteraction | null {
		raycaster.setFromCamera(pointer, camera);
		const meshes = collectInteractiveMeshes(scene);
		const hits = raycaster.intersectObjects(meshes, false);
		if (hits.length > 0) {
			const ancestor = getInteractiveAncestor(hits[0].object);
			if (ancestor) {
				return {
					href: ancestor.userData.href,
					label: ancestor.userData.label,
					object: ancestor,
				};
			}
		}
		return null;
	}

	function handleMove(e: MouseEvent): void {
		const now = performance.now();
		if (now - lastHoverEvent < HOVER_THROTTLE) return;
		lastHoverEvent = now;

		updatePointer(e);
		const hit = raycast();

		if (hit?.href !== hovered?.href) {
			hovered = hit;
			canvas.style.cursor = hit ? "pointer" : "default";
			onHover(hit);
		}
	}

	// Track mousedown position to distinguish clicks from drags
	let mouseDownX = 0;
	let mouseDownY = 0;
	const CLICK_THRESHOLD = 5; // pixels

	function handleMouseDown(e: MouseEvent): void {
		mouseDownX = e.clientX;
		mouseDownY = e.clientY;
	}

	function handleClick(e: MouseEvent): void {
		// Only fire click if the mouse didn't move much (not a drag)
		const dx = e.clientX - mouseDownX;
		const dy = e.clientY - mouseDownY;
		if (dx * dx + dy * dy > CLICK_THRESHOLD * CLICK_THRESHOLD) return;

		updatePointer(e);
		const hit = raycast();
		if (hit) {
			onClick(hit);
		}
	}

	function handleTouchEnd(e: TouchEvent): void {
		if (e.changedTouches.length > 0) {
			updatePointer(e.changedTouches[0]);
			const hit = raycast();
			if (hit) {
				e.preventDefault();
				onClick(hit);
			}
		}
	}

	// Keyboard accessibility
	const interactiveList = collectInteractiveGroups(scene);
	let focusIndex = -1;

	function handleKeydown(e: KeyboardEvent): void {
		if (e.key === "Tab") {
			e.preventDefault();
			focusIndex =
				(focusIndex + (e.shiftKey ? -1 : 1) + interactiveList.length) % interactiveList.length;
			const obj = interactiveList[focusIndex];
			const interaction: DeskInteraction = {
				href: obj.userData.href,
				label: obj.userData.label,
				object: obj,
			};
			hovered = interaction;
			onHover(interaction);
		} else if (e.key === "Enter" && hovered) {
			onClick(hovered);
		}
	}

	canvas.addEventListener("mousedown", handleMouseDown);
	canvas.addEventListener("mousemove", handleMove);
	canvas.addEventListener("click", handleClick);
	canvas.addEventListener("touchend", handleTouchEnd, { passive: false });
	window.addEventListener("keydown", handleKeydown);

	return () => {
		canvas.removeEventListener("mousedown", handleMouseDown);
		canvas.removeEventListener("mousemove", handleMove);
		canvas.removeEventListener("click", handleClick);
		canvas.removeEventListener("touchend", handleTouchEnd);
		window.removeEventListener("keydown", handleKeydown);
	};
}
