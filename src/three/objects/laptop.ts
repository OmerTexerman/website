import { BoxGeometry, Group, Mesh } from "three";
import { metalMaterial, screenMaterial } from "../materials";

/** Laptop → links to /projects */
export function createLaptop(): Group {
	const laptop = new Group();
	laptop.userData = { interactive: true, href: "/projects", label: "Projects" };

	// Base
	const baseGeo = new BoxGeometry(1.2, 0.05, 0.8);
	const base = new Mesh(baseGeo, metalMaterial);
	base.position.set(0, 0.025, 0);
	base.castShadow = true;
	laptop.add(base);

	// Keyboard area (dark inset)
	const kbGeo = new BoxGeometry(1.0, 0.01, 0.5);
	const kb = new Mesh(kbGeo, metalMaterial.clone());
	kb.material.color.set("#2a2a2a");
	kb.position.set(0, 0.055, 0.05);
	laptop.add(kb);

	// Screen (angled)
	const screenGroup = new Group();
	const screenGeo = new BoxGeometry(1.18, 0.75, 0.03);
	const screen = new Mesh(screenGeo, metalMaterial);
	screen.castShadow = true;
	screenGroup.add(screen);

	// Screen face — uniform emissive glow across the whole surface (no point light)
	const faceGeo = new BoxGeometry(1.05, 0.65, 0.005);
	const face = new Mesh(faceGeo, screenMaterial);
	face.position.set(0, 0, 0.018);
	screenGroup.add(face);

	screenGroup.position.set(0, 0.375, -0.38);
	screenGroup.rotation.x = -0.25;
	laptop.add(screenGroup);

	laptop.position.set(0.5, 0.12, -0.3);

	return laptop;
}
