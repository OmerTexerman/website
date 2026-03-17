import { Box3, BoxGeometry, Mesh, MeshBasicMaterial, type Object3D, Vector3 } from "three";

const invisibleMat = new MeshBasicMaterial({ visible: false });
const _box = new Box3();
const _size = new Vector3();
const _center = new Vector3();

/**
 * Adds an invisible box mesh to a group that covers its entire bounding box
 * with some padding. This gives a much more forgiving click/hover target
 * than raycasting against the tiny individual meshes.
 */
export function addHitbox(group: Object3D, padding = 0.15): void {
	// Compute bounding box in local space
	_box.setFromObject(group);

	// Convert to local space of the group
	const worldPos = group.getWorldPosition(new Vector3());
	_box.min.sub(worldPos);
	_box.max.sub(worldPos);

	_box.getSize(_size);
	_box.getCenter(_center);

	// Add padding
	_size.x += padding * 2;
	_size.y += padding * 2;
	_size.z += padding * 2;

	const geo = new BoxGeometry(_size.x, _size.y, _size.z);
	const hitbox = new Mesh(geo, invisibleMat);
	hitbox.position.copy(_center);
	hitbox.raycast = Mesh.prototype.raycast; // ensure raycasting works on invisible mesh
	group.add(hitbox);
}
