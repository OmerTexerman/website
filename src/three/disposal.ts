import { Light, type Material, Mesh, type Object3D, Texture } from "three";

function collectMaterialResources(
	material: Material,
	materials: Set<Material>,
	textures: Set<Texture>,
): void {
	if (materials.has(material)) return;
	materials.add(material);

	for (const value of Object.values(material)) {
		if (value instanceof Texture) {
			textures.add(value);
		}
	}
}

/**
 * Release the pixel buffer backing a canvas-sourced texture.
 * `texture.dispose()` frees the GPU-side resource, but the source
 * HTMLCanvasElement's bitmap stays allocated. Shrinking it to 1×1
 * releases that memory. (Assumes HTMLCanvasElement — does not apply
 * to OffscreenCanvas.)
 */
function releaseTextureSource(texture: Texture): void {
	const source = texture.image;
	if (source instanceof HTMLCanvasElement) {
		source.width = 1;
		source.height = 1;
	}
}

export function disposeObjectResources(root: Object3D): void {
	const geometries = new Set<{ dispose: () => void }>();
	const materials = new Set<Material>();
	const textures = new Set<Texture>();

	root.traverse((child) => {
		// Dispose shadow-map GPU resources for lights (e.g. SpotLight, DirectionalLight).
		if (child instanceof Light) {
			const shadow = (child as { shadow?: { map?: { dispose?: () => void } } }).shadow;
			shadow?.map?.dispose?.();
			return;
		}

		if (!(child instanceof Mesh)) return;

		geometries.add(child.geometry);

		if (Array.isArray(child.material)) {
			for (const material of child.material) {
				if (!material.userData.shared) collectMaterialResources(material, materials, textures);
			}
			return;
		}

		if (!child.material.userData.shared)
			collectMaterialResources(child.material, materials, textures);
	});

	for (const texture of textures) {
		releaseTextureSource(texture);
		texture.dispose();
	}
	for (const material of materials) material.dispose();
	for (const geometry of geometries) geometry.dispose();
}
