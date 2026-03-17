import { type Camera, Vector3 } from "three";
import type { DeskInteraction } from "./interaction";

let labelEl: HTMLElement | null = null;
let container: HTMLElement | null = null;

export function initLabels(containerEl: HTMLElement): void {
	container = containerEl;

	labelEl = document.createElement("div");
	labelEl.className = "desk-label";
	labelEl.style.cssText = `
		position: absolute;
		pointer-events: none;
		font-family: 'Caveat', cursive;
		font-size: 1.25rem;
		color: #f0ece4;
		background: rgba(10, 10, 10, 0.75);
		backdrop-filter: blur(4px);
		padding: 0.25rem 0.75rem;
		border-radius: 0.5rem;
		border: 1px solid rgba(255, 255, 255, 0.1);
		opacity: 0;
		transform: translateY(4px);
		transition: opacity 0.2s ease, transform 0.2s ease;
		white-space: nowrap;
		z-index: 10;
	`;
	container.appendChild(labelEl);
}

export function updateLabel(
	interaction: DeskInteraction | null,
	camera: Camera,
	canvas: HTMLCanvasElement,
): void {
	if (!labelEl || !container) return;

	if (!interaction) {
		labelEl.style.opacity = "0";
		labelEl.style.transform = "translateY(4px)";
		return;
	}

	// Project 3D position to 2D
	const pos = new Vector3();
	interaction.object.getWorldPosition(pos);
	pos.y += 0.5; // float above the object
	pos.project(camera);

	const x = (pos.x * 0.5 + 0.5) * canvas.clientWidth;
	const y = (-pos.y * 0.5 + 0.5) * canvas.clientHeight;

	labelEl.textContent = interaction.label;
	labelEl.style.left = `${x}px`;
	labelEl.style.top = `${y}px`;
	labelEl.style.transform = "translate(-50%, -100%) translateY(-8px)";
	labelEl.style.opacity = "1";
}

export function disposeLabels(): void {
	if (labelEl && container) {
		container.removeChild(labelEl);
		labelEl = null;
	}
}
