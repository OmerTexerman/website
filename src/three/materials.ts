import { Color, MeshPhysicalMaterial, MeshStandardMaterial } from "three";

export const woodMaterial = new MeshStandardMaterial({
	color: new Color("#5c3a1e"),
	roughness: 0.85,
	metalness: 0.0,
});

export const darkWoodMaterial = new MeshStandardMaterial({
	color: new Color("#3a2210"),
	roughness: 0.9,
	metalness: 0.0,
});

export const paperMaterial = new MeshStandardMaterial({
	color: new Color("#f0ece4"),
	roughness: 1.0,
	metalness: 0.0,
});

export const metalMaterial = new MeshStandardMaterial({
	color: new Color("#8a8a8a"),
	roughness: 0.3,
	metalness: 0.8,
});

export const screenMaterial = new MeshStandardMaterial({
	color: new Color("#4a7aaa"),
	emissive: new Color("#5a8aba"),
	emissiveIntensity: 2.5,
	roughness: 0.05,
	metalness: 0.1,
});

export const darkMetalMaterial = new MeshStandardMaterial({
	color: new Color("#2a2a2a"),
	roughness: 0.3,
	metalness: 0.8,
});

export const accentMaterial = new MeshStandardMaterial({
	color: new Color("#c4453a"),
	roughness: 0.6,
	metalness: 0.1,
});

export const corkMaterial = new MeshStandardMaterial({
	color: new Color("#c4a46c"),
	roughness: 1.0,
	metalness: 0.0,
});

export function createBookMaterial(color: string): MeshStandardMaterial {
	return new MeshStandardMaterial({
		color: new Color(color),
		roughness: 0.8,
		metalness: 0.0,
	});
}

export const ceramicMaterial = new MeshPhysicalMaterial({
	color: new Color("#e8e0d4"),
	roughness: 0.4,
	metalness: 0.0,
	clearcoat: 0.3,
});

export const pcbMaterial = new MeshStandardMaterial({
	color: new Color("#1a472a"),
	roughness: 0.7,
	metalness: 0.1,
});

// Shelf wall materials
export const plasterMaterial = new MeshStandardMaterial({
	color: new Color("#2a2520"),
	roughness: 0.95,
	metalness: 0.0,
});

export const shelfWoodMaterial = new MeshStandardMaterial({
	color: new Color("#4a3520"),
	roughness: 0.85,
	metalness: 0.0,
});

const allSharedMaterials = [
	woodMaterial,
	darkWoodMaterial,
	paperMaterial,
	metalMaterial,
	darkMetalMaterial,
	screenMaterial,
	accentMaterial,
	corkMaterial,
	ceramicMaterial,
	pcbMaterial,
	plasterMaterial,
	shelfWoodMaterial,
];

export function disposeMaterials(): void {
	for (const mat of allSharedMaterials) {
		mat.dispose();
	}
}
