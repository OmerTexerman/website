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
	ACCENT,
	LIGHT_AMBIENT,
	LIGHT_BOTTOM_FILL,
	LIGHT_CEILING_KEY,
	LIGHT_FRONT_FILL,
	LIGHT_HEMI_GROUND,
	LIGHT_HEMI_SKY,
	LIGHT_NOTEBOOK_ACCENT,
	LIGHT_ROOM_FILL,
	LIGHT_SHELF_KEY,
	LIGHT_SHELF_SIDE_FILL,
} from "./colors";
import { SHELF_BOT_Y, SHELF_MID_Y, SHELF_TOP_Y, SHELF_WALL_X, SHELF_WALL_Z } from "./shelf-layout";

function configureShadowLight(light: SpotLight | PointLight, mapSize = 1024): void {
	light.castShadow = true;
	light.shadow.mapSize.width = mapSize;
	light.shadow.mapSize.height = mapSize;
	light.shadow.bias = -0.0002;
}

/** Scene-level direction-independent lighting (stays fixed during rotation) */
export function setupSceneLighting(scene: Scene): void {
	const hemi = new HemisphereLight(new Color(LIGHT_HEMI_SKY), new Color(LIGHT_HEMI_GROUND), 1.1);
	scene.add(hemi);

	const ambient = new AmbientLight(new Color(LIGHT_AMBIENT), 1.4);
	scene.add(ambient);
}

/** Shared room lights so desk and shelf read as the same physical space */
export function setupRoomLighting(roomGroup: Group, mobile = false): void {
	const shadowRes = mobile ? 512 : 1024;

	const ceilingKey = new SpotLight(new Color(LIGHT_CEILING_KEY), 4.6, 28, Math.PI / 5, 0.35, 1.4);
	ceilingKey.position.set(2.6, 7.2, 4.3);
	ceilingKey.target.position.set(3.3, 0.9, 3.9);
	configureShadowLight(ceilingKey, shadowRes);
	roomGroup.add(ceilingKey);
	roomGroup.add(ceilingKey.target);

	const shelfSideFill = new PointLight(new Color(LIGHT_SHELF_SIDE_FILL), 0.9, 20, 1.6);
	shelfSideFill.position.set(7.4, 4.9, 6.8);
	configureShadowLight(shelfSideFill, shadowRes);
	roomGroup.add(shelfSideFill);
}

/** Desk-specific positional lights — added to the room group so they rotate with it */
export function setupDeskLighting(roomGroup: Group): void {
	// Warm overhead fill
	const roomFill = new PointLight(new Color(LIGHT_ROOM_FILL), 1.4, 30, 1.1);
	roomFill.position.set(0, 6, 2);
	roomGroup.add(roomFill);

	// Secondary fill from front-left
	const frontFill = new PointLight(new Color(LIGHT_FRONT_FILL), 0.8, 20, 1.5);
	frontFill.position.set(-3, 4, 5);
	roomGroup.add(frontFill);

	// Safelight red accent
	const safelight = new PointLight(new Color(ACCENT), 0.28, 12, 2);
	safelight.position.set(3, 2.5, -1);
	roomGroup.add(safelight);
}

/** Shelf-specific lighting — tighter key/fill so the shelf reads with stronger shadows */
export function setupShelfLighting(roomGroup: Group, mobile = false): void {
	const shadowRes = mobile ? 512 : 1024;

	const shelfKey = new SpotLight(new Color(LIGHT_SHELF_KEY), 5.6, 16, Math.PI / 6, 0.45, 1.6);
	shelfKey.position.set(SHELF_WALL_X - 1.2, SHELF_TOP_Y + 1.35, SHELF_WALL_Z + 1.4);
	shelfKey.target.position.set(SHELF_WALL_X - 0.15, SHELF_MID_Y + 0.25, SHELF_WALL_Z);
	configureShadowLight(shelfKey, shadowRes);
	roomGroup.add(shelfKey);
	roomGroup.add(shelfKey.target);

	const notebookAccent = new PointLight(new Color(LIGHT_NOTEBOOK_ACCENT), 0.75, 7, 1.9);
	notebookAccent.position.set(SHELF_WALL_X - 0.55, SHELF_MID_Y + 0.7, SHELF_WALL_Z - 1.1);
	roomGroup.add(notebookAccent);

	const bottomFill = new PointLight(new Color(LIGHT_BOTTOM_FILL), 1.2, 10, 1.7);
	bottomFill.position.set(SHELF_WALL_X - 1.0, SHELF_BOT_Y + 0.75, SHELF_WALL_Z + 0.9);
	roomGroup.add(bottomFill);
}
