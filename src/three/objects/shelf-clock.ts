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

const CLOCK_RADIUS = 0.28;

/** Returns the rotation (in radians) for clock hands based on the current time. */
export function getClockAngles(): { minute: number; hour: number } {
	const now = new Date();
	const m = now.getMinutes() + now.getSeconds() / 60;
	const h = (now.getHours() % 12) + m / 60;
	return {
		minute: -(m / 60) * Math.PI * 2,
		hour: -(h / 12) * Math.PI * 2,
	};
}

/** Sync clock hand pivots to the current time. */
export function syncClockToTime(clock: Group): void {
	const { minutePivot, hourPivot } = clock.userData.clockParts as {
		minutePivot: Group;
		hourPivot: Group;
	};
	const angles = getClockAngles();
	minutePivot.rotation.z = angles.minute;
	hourPivot.rotation.z = angles.hour;
}

/** Wall clock for the shelf scene. Hands show the visitor's local time. */
export function createShelfClock(): Group {
	const clock = new Group();
	clock.userData = { interactive: true };

	// Per-call materials so scene teardown can dispose them without corrupting rebuilds.
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

	// Minute hand — own pivot
	const minutePivot = new Group();
	minutePivot.position.z = 0.01;
	clock.add(minutePivot);
	const minuteHand = new Mesh(new BoxGeometry(0.008, 0.11, 0.003), handMaterial);
	minuteHand.position.y = 0.055;
	minutePivot.add(minuteHand);

	// Hour hand — own pivot
	const hourPivot = new Group();
	hourPivot.position.z = 0.012;
	clock.add(hourPivot);
	const hourHand = new Mesh(new BoxGeometry(0.01, 0.07, 0.003), handMaterial);
	hourHand.position.y = 0.035;
	hourPivot.add(hourHand);

	clock.userData.clockParts = { minutePivot, hourPivot };

	// Set hands to current time
	syncClockToTime(clock);

	return clock;
}
