import { BoxGeometry, Color, Group, Mesh, MeshStandardMaterial, PlaneGeometry } from "three";
import { BASEBOARD, ROOM_WALL } from "./colors";

const FLOOR_Y = -2;
const BASEBOARD_H = 0.16;
const BASEBOARD_D = 0.04;

/**
 * A plain room wall running down to the floor, with a dark baseboard where
 * they meet so the edge reads as an ordinary corner. Shared by the desk and
 * the shelf scenes, so the two walls meet as a room corner during the
 * transition. Big enough that its top and sides never come into view, even
 * from the intro's high, wide start.
 *
 * The wall faces +z with its base on the floor; rotate and place the group
 * from the caller.
 */
export function createRoomWall(width: number, height = 26): Group {
	const g = new Group();

	const wall = new Mesh(
		new PlaneGeometry(width, height),
		// Dithered: the lamps' soft falloff across a big dark surface otherwise
		// bands into visible rings.
		new MeshStandardMaterial({
			color: new Color(ROOM_WALL),
			roughness: 1,
			metalness: 0,
			dithering: true,
		}),
	);
	wall.position.y = FLOOR_Y + height / 2;
	// Receives shadows so the shelf planks stop the candle's light reaching the
	// wall below them. (The key light's normalBias keeps its grazing angle on
	// the wall from banding.)
	wall.receiveShadow = true;
	g.add(wall);

	const baseboard = new Mesh(
		new BoxGeometry(width, BASEBOARD_H, BASEBOARD_D),
		new MeshStandardMaterial({ color: new Color(BASEBOARD), roughness: 0.8, metalness: 0 }),
	);
	baseboard.position.set(0, FLOOR_Y + BASEBOARD_H / 2, BASEBOARD_D / 2);
	baseboard.receiveShadow = true;
	g.add(baseboard);

	return g;
}
