import { Box3, BoxGeometry, Mesh, MeshBasicMaterial, type Object3D, Vector3 } from "three";

const _box = new Box3();
const _size = new Vector3();
const _center = new Vector3();
const _worldPos = new Vector3();

/** Adds an invisible box mesh covering the group's bounding box + padding.
 *  `measure` sizes it from just part of the group (e.g. not a pipe that
 *  reaches up toward a neighbour); the group must be unrotated. */
export function addHitbox(group: Object3D, padding = 0.15, measure: Object3D = group): void {
	_box.setFromObject(measure);

	group.getWorldPosition(_worldPos);
	_box.min.sub(_worldPos);
	_box.max.sub(_worldPos);

	_box.getSize(_size);
	_box.getCenter(_center);

	_size.x += padding * 2;
	_size.y += padding * 2;
	_size.z += padding * 2;

	// Create a fresh material per call so disposeObjectResources can safely free it
	// without corrupting hitboxes created in future scene rebuilds.
	const invisibleMat = new MeshBasicMaterial({ visible: false });
	const hitbox = new Mesh(new BoxGeometry(_size.x, _size.y, _size.z), invisibleMat);
	hitbox.position.copy(_center);
	group.add(hitbox);
}
