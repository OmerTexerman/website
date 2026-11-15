import { Box3, BoxGeometry, Matrix4, Mesh, MeshBasicMaterial, type Object3D, Vector3 } from "three";

const _box = new Box3();
const _part = new Box3();
const _toLocal = new Matrix4();
const _matrix = new Matrix4();
const _size = new Vector3();
const _center = new Vector3();
const _scale = new Vector3();

/** Adds an invisible box that makes a group easy to click or tap: its
 *  clickable meshes' bounds plus `padding` (world units).
 *
 *  - The box lives in the group's own frame, so it turns with the group
 *    instead of becoming an oversized upright box around a rotated object.
 *  - It's sized from `measure` (default: the whole group), counting only
 *    meshes that can be clicked: fake shadows and other parts made
 *    unclickable (`raycast` replaced) don't inflate it.
 *  - `padBelow: false` keeps the bottom flush, for things standing on a
 *    shelf: padding there reached through the plank into the space below. */
export function addHitbox(
	group: Object3D,
	padding = 0.15,
	measure: Object3D = group,
	{ padBelow = true }: { padBelow?: boolean } = {},
): void {
	group.updateWorldMatrix(true, false);
	measure.updateWorldMatrix(true, true);
	_toLocal.copy(group.matrixWorld).invert();
	_box.makeEmpty();
	measure.traverse((child) => {
		if (!(child instanceof Mesh) || child.raycast !== Mesh.prototype.raycast) return;
		const material = child.material as { visible?: boolean };
		if (material.visible === false) return; // another hitbox
		if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
		_part.copy(child.geometry.boundingBox);
		_box.union(_part.applyMatrix4(_matrix.multiplyMatrices(_toLocal, child.matrixWorld)));
	});
	if (_box.isEmpty()) return;

	// Padding is in world units; the box is in the group's (maybe scaled) frame.
	group.getWorldScale(_scale);
	const pad = _scale.set(padding / _scale.x, padding / _scale.y, padding / _scale.z);
	_box.min.x -= pad.x;
	_box.max.x += pad.x;
	_box.max.y += pad.y;
	if (padBelow) _box.min.y -= pad.y;
	_box.min.z -= pad.z;
	_box.max.z += pad.z;
	_box.getSize(_size);
	_box.getCenter(_center);

	// Create a fresh material per call so disposeObjectResources can safely free it
	// without corrupting hitboxes created in future scene rebuilds.
	const invisibleMat = new MeshBasicMaterial({ visible: false });
	const hitbox = new Mesh(new BoxGeometry(_size.x, _size.y, _size.z), invisibleMat);
	hitbox.position.copy(_center);
	group.add(hitbox);
}
