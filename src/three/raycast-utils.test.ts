import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Scene } from "three";
import { describe, expect, it } from "vitest";
import { collectOccluders } from "./raycast-utils";

const mesh = (material = new MeshBasicMaterial()) => new Mesh(new BoxGeometry(), material);

describe("collectOccluders", () => {
	it("blocks with solid scenery only", () => {
		const scene = new Scene();
		const plank = mesh();
		const shadow = mesh(new MeshBasicMaterial({ transparent: true, opacity: 0.4 }));
		const hitbox = mesh(new MeshBasicMaterial({ visible: false }));
		const pipe = mesh();
		pipe.raycast = () => {};
		const hidden = mesh();
		hidden.visible = false;
		const clickable = new Group();
		clickable.userData.interactive = true;
		const book = mesh();
		clickable.add(book);
		scene.add(plank, shadow, hitbox, pipe, hidden, clickable);

		expect(collectOccluders(scene, "interactive")).toEqual([plank]);
	});
});
