import {
	Color,
	ConeGeometry,
	CylinderGeometry,
	Group,
	Mesh,
	MeshStandardMaterial,
	PointLight,
} from "three";
import { CERAMIC, WARM_GLOW } from "../colors";

const CANDLE_ON_INTENSITY = 1.2;

const jarMaterial = new MeshStandardMaterial({
	color: new Color("#3a3632"),
	roughness: 0.25,
	metalness: 0.05,
	transparent: true,
	opacity: 0.6,
});

const waxMaterial = new MeshStandardMaterial({
	color: new Color(CERAMIC),
	roughness: 0.9,
	metalness: 0.0,
});

const wickMaterial = new MeshStandardMaterial({
	color: new Color("#1a1a1a"),
	roughness: 1.0,
	metalness: 0.0,
});

/** Small jar candle for the shelf. Tap to light / extinguish. */
export function createShelfCandle(): Group {
	const candle = new Group();
	candle.userData = { interactive: true, candleLit: true };

	// Glass jar
	const jar = new Mesh(new CylinderGeometry(0.09, 0.08, 0.14, 16), jarMaterial);
	jar.position.y = 0.07;
	jar.castShadow = true;
	candle.add(jar);

	// Wax fill inside jar
	const wax = new Mesh(new CylinderGeometry(0.075, 0.075, 0.06, 16), waxMaterial);
	wax.position.y = 0.09;
	candle.add(wax);

	// Wick
	const wick = new Mesh(new CylinderGeometry(0.003, 0.003, 0.04, 4), wickMaterial);
	wick.position.y = 0.13;
	candle.add(wick);

	// Flame — small cone with glow
	const flameMat = new MeshStandardMaterial({
		color: new Color(WARM_GLOW),
		emissive: new Color(WARM_GLOW),
		emissiveIntensity: 2.0,
	});
	const flame = new Mesh(new ConeGeometry(0.015, 0.04, 6), flameMat);
	flame.position.y = 0.16;
	candle.add(flame);

	// Point light for warm glow
	const light = new PointLight(new Color(WARM_GLOW), CANDLE_ON_INTENSITY, 2.5, 1.5);
	light.position.y = 0.16;
	candle.add(light);

	candle.userData.candleParts = { flame, light, flameMat };

	return candle;
}

export function toggleCandle(candle: Group): boolean {
	const lit = !candle.userData.candleLit;
	candle.userData.candleLit = lit;
	const { flame, light, flameMat } = candle.userData.candleParts as {
		flame: Mesh;
		light: PointLight;
		flameMat: MeshStandardMaterial;
	};
	flame.visible = lit;
	light.intensity = lit ? CANDLE_ON_INTENSITY : 0;
	flameMat.emissiveIntensity = lit ? 2.0 : 0;
	return lit;
}
