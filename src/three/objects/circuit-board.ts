import { BoxGeometry, Color, Group, Mesh, MeshStandardMaterial } from "three";
import { pcbMaterial } from "../materials";
import { DESK_SURFACE_Y } from "../math-utils";

/** Decorative circuit board */
export function createCircuitBoard(): Group {
	const board = new Group();
	board.userData = { draggable: true };

	// PCB base
	const baseGeo = new BoxGeometry(0.5, 0.02, 0.35);
	const base = new Mesh(baseGeo, pcbMaterial);
	base.castShadow = true;
	board.add(base);

	// Tiny components (chips, capacitors, etc.)
	const componentMat = new MeshStandardMaterial({
		color: new Color("#1a1a1a"),
		roughness: 0.4,
		metalness: 0.6,
	});
	const chipMat = new MeshStandardMaterial({
		color: new Color("#2a2a2a"),
		roughness: 0.3,
		metalness: 0.5,
	});

	// Main IC chip
	const chipGeo = new BoxGeometry(0.1, 0.02, 0.1);
	const chip = new Mesh(chipGeo, chipMat);
	chip.position.set(0, 0.02, 0);
	board.add(chip);

	// Small components grid
	const smGeo = new BoxGeometry(0.03, 0.015, 0.015);
	const positions = [
		[-0.15, 0.1],
		[-0.1, 0.1],
		[0.1, -0.1],
		[0.15, -0.1],
		[-0.15, -0.08],
		[0.12, 0.08],
	];
	for (const [x, z] of positions) {
		const comp = new Mesh(smGeo, componentMat);
		comp.position.set(x, 0.018, z);
		board.add(comp);
	}

	// Traces (thin lines on the board)
	const traceMat = new MeshStandardMaterial({
		color: new Color("#8a7a2a"),
		roughness: 0.2,
		metalness: 0.8,
	});
	const traceGeo = new BoxGeometry(0.3, 0.002, 0.005);
	for (let i = 0; i < 3; i++) {
		const trace = new Mesh(traceGeo, traceMat);
		trace.position.set(0, 0.012, -0.1 + i * 0.08);
		board.add(trace);
	}

	board.position.set(1.5, DESK_SURFACE_Y, -0.5);
	board.rotation.y = -0.3;

	return board;
}
