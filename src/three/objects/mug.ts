import {
	BackSide,
	CircleGeometry,
	Color,
	CylinderGeometry,
	Group,
	Mesh,
	MeshStandardMaterial,
	RingGeometry,
	TorusGeometry,
} from "three";
import { ceramicMaterial } from "../materials";
import { DESK_SURFACE_Y } from "../math-utils";

const HEIGHT = 0.22;
const TOP_R = 0.12;
const BOTTOM_R = 0.1;
const WALL = 0.012;
const SEGMENTS = 24;
/** How far below the rim the coffee sits. */
const COFFEE_DROP = 0.035;

const coffeeMaterial = new MeshStandardMaterial({
	color: new Color("#3b2416"),
	roughness: 0.25,
	metalness: 0,
});

/** Decorative coffee mug: open at the top, with a rim and coffee inside. */
export function createMug(): Group {
	const mug = new Group();
	mug.userData = { draggable: true, interactive: true, breakable: true };

	// Outer wall, open at the top so the inside shows
	const outer = new Mesh(
		new CylinderGeometry(TOP_R, BOTTOM_R, HEIGHT, SEGMENTS, 1, true),
		ceramicMaterial,
	);
	outer.position.y = HEIGHT / 2;
	outer.castShadow = true;
	mug.add(outer);

	// Base
	const base = new Mesh(new CircleGeometry(BOTTOM_R, SEGMENTS), ceramicMaterial);
	base.rotation.x = Math.PI / 2;
	mug.add(base);

	// Inner wall: rendered from inside, so it reads as the mug's interior
	const innerMaterial = ceramicMaterial.clone();
	innerMaterial.side = BackSide;
	const inner = new Mesh(
		new CylinderGeometry(TOP_R - WALL, BOTTOM_R - WALL, HEIGHT - WALL, SEGMENTS, 1, true),
		innerMaterial,
	);
	inner.position.y = WALL + (HEIGHT - WALL) / 2;
	inner.receiveShadow = true;
	mug.add(inner);

	// Rim joining the two walls
	const rim = new Mesh(new RingGeometry(TOP_R - WALL, TOP_R, SEGMENTS), ceramicMaterial);
	rim.rotation.x = -Math.PI / 2;
	rim.position.y = HEIGHT;
	mug.add(rim);

	// Coffee surface, a little below the rim. The inner wall tapers, so size
	// the disc to its radius at that height.
	const coffeeY = HEIGHT - COFFEE_DROP;
	const t = (coffeeY - WALL) / (HEIGHT - WALL);
	const coffeeR = BOTTOM_R - WALL + (TOP_R - BOTTOM_R) * t;
	const coffee = new Mesh(new CircleGeometry(coffeeR, SEGMENTS), coffeeMaterial);
	coffee.rotation.x = -Math.PI / 2;
	coffee.position.y = coffeeY;
	coffee.receiveShadow = true;
	mug.add(coffee);

	// Handle
	const handleGeo = new TorusGeometry(0.06, 0.015, 8, 12, Math.PI);
	const handle = new Mesh(handleGeo, ceramicMaterial);
	// Body tapers to r≈0.105 at the handle's lower end; inset so both ends sink into the wall
	handle.position.set(0.095, 0.12, 0);
	// Half-torus arcs over +Y by default; rotate so it bulges outward along +X
	handle.rotation.z = -Math.PI / 2;
	mug.add(handle);

	mug.position.set(-0.6, DESK_SURFACE_Y, 0.9);

	return mug;
}
