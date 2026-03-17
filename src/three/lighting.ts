import { AmbientLight, Color, HemisphereLight, PointLight, type Scene } from "three";

export function setupLighting(scene: Scene): void {
	// Hemisphere — strong sky/ground fill
	const hemi = new HemisphereLight(new Color("#e8e4e0"), new Color("#6a5a4a"), 1.5);
	scene.add(hemi);

	// Ambient — generous base so nothing disappears into black
	const ambient = new AmbientLight(new Color("#a0a0a0"), 2.5);
	scene.add(ambient);

	// Warm overhead fill (room ceiling light, broad reach)
	const roomFill = new PointLight(new Color("#ffe8cc"), 2.0, 30, 1.0);
	roomFill.position.set(0, 6, 2);
	scene.add(roomFill);

	// Secondary fill from front-left
	const frontFill = new PointLight(new Color("#e0d8d0"), 1.0, 20, 1.5);
	frontFill.position.set(-3, 4, 5);
	scene.add(frontFill);

	// Safelight red accent — very subtle
	const safelight = new PointLight(new Color("#c4453a"), 0.2, 12, 2);
	safelight.position.set(3, 2.5, -1);
	scene.add(safelight);
}
