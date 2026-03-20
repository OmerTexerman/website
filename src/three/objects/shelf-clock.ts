import {
	BoxGeometry,
	CircleGeometry,
	Color,
	CylinderGeometry,
	Group,
	Mesh,
	MeshStandardMaterial,
	RingGeometry,
} from "three";
import { CERAMIC, DARK_METAL } from "../colors";

const frameMaterial = new MeshStandardMaterial({
	color: new Color(DARK_METAL),
	roughness: 0.3,
	metalness: 0.8,
});

const faceMaterial = new MeshStandardMaterial({
	color: new Color(CERAMIC),
	roughness: 0.8,
	metalness: 0.0,
});

const handMaterial = new MeshStandardMaterial({
	color: new Color("#1a1a1a"),
	roughness: 0.4,
	metalness: 0.6,
});

const tickMaterial = new MeshStandardMaterial({
	color: new Color("#333333"),
	roughness: 0.5,
	metalness: 0.3,
});

const CLOCK_RADIUS = 0.18;

/** Small wall clock for the shelf scene. Tap to spin the hands. */
export function createShelfClock(): Group {
	const clock = new Group();
	clock.userData = { interactive: true };

	// Frame ring
	const frame = new Mesh(new RingGeometry(CLOCK_RADIUS - 0.015, CLOCK_RADIUS, 32), frameMaterial);
	clock.add(frame);

	// Face disc
	const face = new Mesh(new CircleGeometry(CLOCK_RADIUS - 0.015, 32), faceMaterial);
	face.position.z = 0.005;
	clock.add(face);

	// Hour tick marks (12)
	for (let i = 0; i < 12; i++) {
		const angle = (i / 12) * Math.PI * 2;
		const isQuarter = i % 3 === 0;
		const length = isQuarter ? 0.03 : 0.018;
		const width = isQuarter ? 0.008 : 0.005;
		const tick = new Mesh(new BoxGeometry(width, length, 0.003), tickMaterial);
		const dist = CLOCK_RADIUS - 0.03;
		tick.position.set(Math.sin(angle) * dist, Math.cos(angle) * dist, 0.008);
		tick.rotation.z = -angle;
		clock.add(tick);
	}

	// Center dot
	const center = new Mesh(new CylinderGeometry(0.01, 0.01, 0.006, 8), handMaterial);
	center.rotation.x = Math.PI / 2;
	center.position.z = 0.012;
	clock.add(center);

	// Hands pivot — this is what we spin on tap
	const handsPivot = new Group();
	handsPivot.position.z = 0.01;
	clock.add(handsPivot);

	// Minute hand (longer)
	const minuteHand = new Mesh(new BoxGeometry(0.008, 0.11, 0.003), handMaterial);
	minuteHand.position.y = 0.055;
	handsPivot.add(minuteHand);

	// Hour hand (shorter, slightly wider)
	const hourHand = new Mesh(new BoxGeometry(0.01, 0.07, 0.003), handMaterial);
	hourHand.position.y = 0.035;
	// Offset rotation so hands aren't overlapping at rest
	const hourPivot = new Group();
	hourPivot.rotation.z = -Math.PI / 3;
	hourPivot.position.z = 0.002;
	hourPivot.add(hourHand);
	handsPivot.add(hourPivot);

	clock.userData.handsPivot = handsPivot;

	return clock;
}
