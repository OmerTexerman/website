import {
	AmbientLight,
	Color,
	type Group,
	HemisphereLight,
	PointLight,
	type Scene,
	SpotLight,
} from "three";
import {
	SHELF_BOT_Y,
	SHELF_MID_Y,
	SHELF_TOP_Y,
	SHELF_WALL_X,
	SHELF_WALL_Z,
} from "./objects/shelf-wall";

function configureShadowLight(light: SpotLight | PointLight): void {
	light.castShadow = true;
	light.shadow.mapSize.width = 1024;
	light.shadow.mapSize.height = 1024;
	light.shadow.bias = -0.0002;
}

/** Scene-level direction-independent lighting (stays fixed during rotation) */
export function setupSceneLighting(scene: Scene): void {
	const hemi = new HemisphereLight(new Color("#e8e4e0"), new Color("#5f5042"), 1.1);
	scene.add(hemi);

	const ambient = new AmbientLight(new Color("#a8a29a"), 1.4);
	scene.add(ambient);
}

/** Shared room lights so desk and shelf read as the same physical space */
export function setupRoomLighting(roomGroup: Group): void {
	const ceilingKey = new SpotLight(new Color("#ffe6c7"), 4.6, 28, Math.PI / 5, 0.35, 1.4);
	ceilingKey.position.set(2.6, 7.2, 4.3);
	ceilingKey.target.position.set(3.3, 0.9, 3.9);
	configureShadowLight(ceilingKey);
	roomGroup.add(ceilingKey);
	roomGroup.add(ceilingKey.target);

	const shelfSideFill = new PointLight(new Color("#f0d0b6"), 0.9, 20, 1.6);
	shelfSideFill.position.set(7.4, 4.9, 6.8);
	configureShadowLight(shelfSideFill);
	roomGroup.add(shelfSideFill);
}

/** Desk-specific positional lights — added to the room group so they rotate with it */
export function setupDeskLighting(roomGroup: Group): void {
	// Warm overhead fill
	const roomFill = new PointLight(new Color("#ffe8cc"), 1.4, 30, 1.1);
	roomFill.position.set(0, 6, 2);
	roomGroup.add(roomFill);

	// Secondary fill from front-left
	const frontFill = new PointLight(new Color("#e0d8d0"), 0.8, 20, 1.5);
	frontFill.position.set(-3, 4, 5);
	roomGroup.add(frontFill);

	// Safelight red accent
	const safelight = new PointLight(new Color("#c4453a"), 0.28, 12, 2);
	safelight.position.set(3, 2.5, -1);
	roomGroup.add(safelight);
}

/** Shelf-specific lighting — tighter key/fill so the shelf reads with stronger shadows */
export function setupShelfLighting(roomGroup: Group): void {
	const shelfKey = new SpotLight(new Color("#ffe9cc"), 4.8, 16, Math.PI / 6, 0.45, 1.7);
	shelfKey.position.set(SHELF_WALL_X - 1.2, SHELF_TOP_Y + 1.35, SHELF_WALL_Z + 1.4);
	shelfKey.target.position.set(SHELF_WALL_X - 0.15, SHELF_MID_Y + 0.25, SHELF_WALL_Z);
	configureShadowLight(shelfKey);
	roomGroup.add(shelfKey);
	roomGroup.add(shelfKey.target);

	const notebookAccent = new PointLight(new Color("#d66d55"), 0.75, 7, 1.9);
	notebookAccent.position.set(SHELF_WALL_X - 0.55, SHELF_MID_Y + 0.7, SHELF_WALL_Z - 1.1);
	roomGroup.add(notebookAccent);

	const bottomFill = new PointLight(new Color("#f4d7bb"), 0.9, 10, 1.8);
	bottomFill.position.set(SHELF_WALL_X - 1.0, SHELF_BOT_Y + 0.75, SHELF_WALL_Z + 0.9);
	roomGroup.add(bottomFill);
}
