import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PlaneGeometry } from "three";
import { describe, expect, it } from "vitest";
import { addHitbox } from "./hitbox";

function hitboxOf(group: Group): Mesh {
	const box = group.children.at(-1);
	if (!(box instanceof Mesh)) throw new Error("no hitbox");
	box.geometry.computeBoundingBox();
	return box;
}

const solid = (w: number, h: number, d: number) =>
	new Mesh(new BoxGeometry(w, h, d), new MeshBasicMaterial());

describe("addHitbox", () => {
	it("pads the clickable bounds on every side by default", () => {
		const group = new Group();
		group.add(solid(1, 1, 1));
		addHitbox(group, 0.1);
		const { min, max } = hitboxOf(group).geometry.boundingBox ?? { min: null, max: null };
		expect(max?.x).toBeCloseTo(0.6);
		expect(min?.y).toBeCloseTo(-0.6);
	});

	it("keeps the bottom flush for things standing on a shelf", () => {
		const group = new Group();
		const item = solid(1, 1, 1);
		item.position.y = 0.5; // resting on y = 0
		group.add(item);
		addHitbox(group, 0.1, group, { padBelow: false });
		const box = hitboxOf(group);
		const bottom = box.position.y + (box.geometry.boundingBox?.min.y ?? 0);
		const top = box.position.y + (box.geometry.boundingBox?.max.y ?? 0);
		expect(bottom).toBeCloseTo(0);
		expect(top).toBeCloseTo(1.1);
	});

	it("turns with a rotated group instead of growing around it", () => {
		const group = new Group();
		group.rotation.y = Math.PI / 4;
		group.add(solid(2, 1, 0.2));
		addHitbox(group, 0);
		const { min, max } = hitboxOf(group).geometry.boundingBox ?? { min: null, max: null };
		// Still the item's own 2 × 0.2 footprint, in the group's frame.
		expect((max?.x ?? 0) - (min?.x ?? 0)).toBeCloseTo(2);
		expect((max?.z ?? 0) - (min?.z ?? 0)).toBeCloseTo(0.2);
	});

	it("ignores fake shadows and other unclickable parts", () => {
		const group = new Group();
		group.add(solid(1, 1, 1));
		const shadow = new Mesh(new PlaneGeometry(5, 5), new MeshBasicMaterial());
		shadow.raycast = () => {};
		group.add(shadow);
		addHitbox(group, 0);
		const { max } = hitboxOf(group).geometry.boundingBox ?? { max: null };
		expect(max?.x).toBeCloseTo(0.5);
	});

	it("pads in world units when the group is scaled", () => {
		const group = new Group();
		group.scale.setScalar(2);
		group.add(solid(1, 1, 1));
		addHitbox(group, 0.2);
		const { max } = hitboxOf(group).geometry.boundingBox ?? { max: null };
		expect(max?.x).toBeCloseTo(0.6); // 0.5 + 0.2 / 2, i.e. 0.2 in the world
	});
});
