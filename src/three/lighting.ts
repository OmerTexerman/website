import { AmbientLight, Color, type Group, HemisphereLight, PointLight, type Scene } from "three";

/** Scene-level direction-independent lighting (stays fixed during rotation) */
export function setupSceneLighting(scene: Scene): void {
	const hemi = new HemisphereLight(new Color("#e8e4e0"), new Color("#6a5a4a"), 1.5);
	scene.add(hemi);

	const ambient = new AmbientLight(new Color("#a0a0a0"), 2.5);
	scene.add(ambient);
}

/** Desk-specific positional lights — added to the room group so they rotate with it */
export function setupDeskLighting(roomGroup: Group): void {
	// Warm overhead fill
	const roomFill = new PointLight(new Color("#ffe8cc"), 2.0, 30, 1.0);
	roomFill.position.set(0, 6, 2);
	roomGroup.add(roomFill);

	// Secondary fill from front-left
	const frontFill = new PointLight(new Color("#e0d8d0"), 1.0, 20, 1.5);
	frontFill.position.set(-3, 4, 5);
	roomGroup.add(frontFill);

	// Safelight red accent
	const safelight = new PointLight(new Color("#c4453a"), 0.2, 12, 2);
	safelight.position.set(3, 2.5, -1);
	roomGroup.add(safelight);
}

/** Shelf-specific lighting — soft point lights above each shelf, no SpotLights */
export function setupShelfLighting(roomGroup: Group): void {
	// Top shelf light
	const topLight = new PointLight(new Color("#ffe8cc"), 1.5, 8, 1.5);
	topLight.position.set(5.35, 4.2, 4.4);
	roomGroup.add(topLight);

	// Middle shelf light
	const midLight = new PointLight(new Color("#ffe0c0"), 1.2, 8, 1.5);
	midLight.position.set(5.35, 2.8, 4.4);
	roomGroup.add(midLight);

	// Bottom shelf light
	const bottomLight = new PointLight(new Color("#ffd8b0"), 1.0, 8, 1.5);
	bottomLight.position.set(5.35, 1.4, 4.4);
	roomGroup.add(bottomLight);

	// Front fill for shelf visibility
	const frontFill = new PointLight(new Color("#e0d8d0"), 1.5, 20, 1.0);
	frontFill.position.set(3, 3, 5);
	roomGroup.add(frontFill);
}

/** Legacy: original setupLighting for backward compatibility during refactor */
export function setupLighting(scene: Scene): void {
	const hemi = new HemisphereLight(new Color("#e8e4e0"), new Color("#6a5a4a"), 1.5);
	scene.add(hemi);

	const ambient = new AmbientLight(new Color("#a0a0a0"), 2.5);
	scene.add(ambient);

	const roomFill = new PointLight(new Color("#ffe8cc"), 2.0, 30, 1.0);
	roomFill.position.set(0, 6, 2);
	scene.add(roomFill);

	const frontFill = new PointLight(new Color("#e0d8d0"), 1.0, 20, 1.5);
	frontFill.position.set(-3, 4, 5);
	scene.add(frontFill);

	const safelight = new PointLight(new Color("#c4453a"), 0.2, 12, 2);
	safelight.position.set(3, 2.5, -1);
	scene.add(safelight);
}
