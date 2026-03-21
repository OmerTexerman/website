import { Mesh, type Object3D, type Scene } from "three";

/** Convert client coordinates to normalized device coordinates */
export function updatePointer(
	pointer: { x: number; y: number },
	canvas: HTMLCanvasElement,
	clientX: number,
	clientY: number,
): void {
	const rect = canvas.getBoundingClientRect();
	pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
	pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
}

/** Walk up the parent chain looking for an ancestor with the given userData key set to true */
export function getAncestorWith(obj: Object3D, key: string): Object3D | null {
	let current: Object3D | null = obj;
	while (current) {
		if (current.userData?.[key]) return current;
		current = current.parent;
	}
	return null;
}

/** Collect all Mesh descendants of groups matching a userData key */
export function collectMeshesBy(scene: Scene, key: string): Mesh[] {
	const meshes: Mesh[] = [];
	scene.traverse((child) => {
		if (child.userData?.[key]) {
			child.traverse((desc) => {
				if (desc instanceof Mesh) meshes.push(desc);
			});
		}
	});
	return meshes;
}

/** Check if an object and all its ancestors are visible */
function isWorldVisible(obj: Object3D): boolean {
	let current: Object3D | null = obj;
	while (current) {
		if (!current.visible) return false;
		current = current.parent;
	}
	return true;
}

/** Collect top-level groups matching a userData key (only visible objects) */
export function collectGroupsBy(scene: Scene, key: string): Object3D[] {
	const groups: Object3D[] = [];
	scene.traverse((child) => {
		if (child.userData?.[key] && isWorldVisible(child)) groups.push(child);
	});
	return groups;
}
