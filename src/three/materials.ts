import { Color, DoubleSide, MeshPhysicalMaterial, MeshStandardMaterial } from "three";
import {
	ACCENT,
	CERAMIC,
	CORK,
	CREAM,
	DARK_CHARCOAL,
	DARK_METAL,
	DARK_WOOD,
	DICTIONARY_GOLD,
	DICTIONARY_LEATHER,
	DICTIONARY_PAGES,
	DICTIONARY_SPINE,
	METAL,
	NOTEBOOK_RED,
	PCB_GREEN,
	SCREEN_BLUE,
	SCREEN_GLOW,
	SHELF_WOOD,
	SILVER_METAL,
	WOOD,
} from "./colors";

export const woodMaterial = new MeshStandardMaterial({
	color: new Color(WOOD),
	roughness: 0.85,
	metalness: 0.0,
});

export const darkWoodMaterial = new MeshStandardMaterial({
	color: new Color(DARK_WOOD),
	roughness: 0.9,
	metalness: 0.0,
});

export const paperMaterial = new MeshStandardMaterial({
	color: new Color(CREAM),
	roughness: 1.0,
	metalness: 0.0,
});

export const metalMaterial = new MeshStandardMaterial({
	color: new Color(METAL),
	roughness: 0.3,
	metalness: 0.8,
});

export const screenMaterial = new MeshStandardMaterial({
	color: new Color(SCREEN_BLUE),
	emissive: new Color(SCREEN_GLOW),
	emissiveIntensity: 2.5,
	roughness: 0.05,
	metalness: 0.1,
});

export const darkMetalMaterial = new MeshStandardMaterial({
	color: new Color(DARK_METAL),
	roughness: 0.3,
	metalness: 0.8,
});

export const accentMaterial = new MeshStandardMaterial({
	color: new Color(ACCENT),
	roughness: 0.6,
	metalness: 0.1,
});

export const corkMaterial = new MeshStandardMaterial({
	color: new Color(CORK),
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
	color: new Color(CERAMIC),
	roughness: 0.4,
	metalness: 0.0,
	clearcoat: 0.3,
});

export const pcbMaterial = new MeshStandardMaterial({
	color: new Color(PCB_GREEN),
	roughness: 0.7,
	metalness: 0.1,
});

export const shelfWoodMaterial = new MeshStandardMaterial({
	color: new Color(SHELF_WOOD),
	roughness: 0.85,
	metalness: 0.0,
});

export const spiralRingMaterial = new MeshStandardMaterial({
	color: new Color(SILVER_METAL),
	roughness: 0.3,
	metalness: 0.8,
});

export const notebookCoverMaterial = new MeshStandardMaterial({
	color: new Color(NOTEBOOK_RED),
	roughness: 0.7,
	metalness: 0.05,
});

export const shelfNotebookCoverMaterial = new MeshStandardMaterial({
	color: new Color(NOTEBOOK_RED),
	roughness: 0.6,
});

export const cameraBodyMaterial = new MeshStandardMaterial({
	color: new Color(DARK_CHARCOAL),
	roughness: 0.4,
	metalness: 0.6,
});

export const dictionaryLeatherMaterial = new MeshStandardMaterial({
	color: new Color(DICTIONARY_LEATHER),
	roughness: 0.75,
	metalness: 0.0,
});

export const dictionaryGoldMaterial = new MeshStandardMaterial({
	color: new Color(DICTIONARY_GOLD),
	roughness: 0.3,
	metalness: 0.6,
});

export const dictionaryPagesMaterial = new MeshStandardMaterial({
	color: new Color(DICTIONARY_PAGES),
	roughness: 1.0,
	metalness: 0.0,
});

export const dictionarySpineMaterial = new MeshStandardMaterial({
	color: new Color(DICTIONARY_SPINE),
	roughness: 0.7,
	metalness: 0.0,
});

export const dictionaryGoldBorderMaterial = new MeshStandardMaterial({
	color: new Color(DICTIONARY_GOLD),
	roughness: 0.3,
	metalness: 0.55,
	transparent: true,
	opacity: 0.45,
	side: DoubleSide,
});

// Mark all module-level materials as shared so disposeObjectResources does not
// free their GPU resources during scene teardowns — they are reused across rebuilds.
for (const mat of [
	woodMaterial,
	darkWoodMaterial,
	paperMaterial,
	metalMaterial,
	screenMaterial,
	darkMetalMaterial,
	accentMaterial,
	corkMaterial,
	ceramicMaterial,
	pcbMaterial,
	shelfWoodMaterial,
	spiralRingMaterial,
	notebookCoverMaterial,
	shelfNotebookCoverMaterial,
	cameraBodyMaterial,
	dictionaryLeatherMaterial,
	dictionaryGoldMaterial,
	dictionaryPagesMaterial,
	dictionarySpineMaterial,
	dictionaryGoldBorderMaterial,
]) {
	mat.userData.shared = true;
}
