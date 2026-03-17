import { type Material, Mesh, type Object3D, Texture } from "three";

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

export function disposeObjectResources(root: Object3D): void {
	const geometries = new Set<{ dispose: () => void }>();
	const materials = new Set<Material>();
	const textures = new Set<Texture>();

	root.traverse((child) => {
		if (!(child instanceof Mesh)) return;

		geometries.add(child.geometry);

		if (Array.isArray(child.material)) {
			for (const material of child.material) {
				collectMaterialResources(material, materials, textures);
			}
			return;
		}

		collectMaterialResources(child.material, materials, textures);
	});

	for (const texture of textures) texture.dispose();
	for (const material of materials) material.dispose();
	for (const geometry of geometries) geometry.dispose();
}
