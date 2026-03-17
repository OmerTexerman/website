import {
	BoxGeometry,
	Color,
	DoubleSide,
	Group,
	Mesh,
	MeshStandardMaterial,
	PlaneGeometry,
} from "three";
import { corkMaterial } from "../materials";

/** Photo frame / cork board → links to /photos */
export function createPhotoFrame(): Group {
	const frame = new Group();
	frame.userData = { interactive: true, href: "/photos", label: "Photos" };

	// Cork board backing
	const boardGeo = new BoxGeometry(1.0, 0.7, 0.04);
	const board = new Mesh(boardGeo, corkMaterial);
	board.castShadow = true;
	frame.add(board);

	// Background photos (flat planes, stay pinned)
	const bgPhotos = [
		{ x: -0.15, y: 0.08, rot: -0.1, color: "#d4c5a9" },
		{ x: -0.05, y: -0.1, rot: 0.15, color: "#d4b8b8" },
	];
	for (const p of bgPhotos) {
		const geo = new PlaneGeometry(0.28, 0.2);
		const mat = new MeshStandardMaterial({ color: new Color(p.color), roughness: 0.5 });
		const photo = new Mesh(geo, mat);
		photo.position.set(p.x, p.y, 0.025);
		photo.rotation.z = p.rot;
		frame.add(photo);
	}

	// Featured photo — the one that flies out
	// Uses BoxGeometry for thickness so it's visible from all angles during flight
	const flyGeo = new BoxGeometry(0.3, 0.22, 0.005);
	const flyMat = new MeshStandardMaterial({
		color: new Color("#b8c4d4"),
		roughness: 0.4,
		side: DoubleSide,
	});
	const flyPhoto = new Mesh(flyGeo, flyMat);
	flyPhoto.position.set(0.12, -0.02, 0.03);
	flyPhoto.rotation.z = 0.08;
	flyPhoto.userData = { flyPhoto: true };
	frame.add(flyPhoto);

	// Push pins (on the background photos only)
	const pinGeo = new BoxGeometry(0.03, 0.03, 0.03);
	const pinMat = new MeshStandardMaterial({ color: new Color("#c4453a") });
	for (const p of bgPhotos) {
		const pin = new Mesh(pinGeo, pinMat);
		pin.position.set(p.x, p.y + 0.1, 0.04);
		frame.add(pin);
	}

	// Pin for the fly photo
	const flyPin = new Mesh(pinGeo, pinMat);
	flyPin.position.set(0.12, 0.08, 0.04);
	frame.add(flyPin);

	frame.position.set(-1.8, 0.55, -1.2);
	frame.rotation.x = -0.15;

	return frame;
}
