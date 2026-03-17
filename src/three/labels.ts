import { type Camera, Vector3 } from "three";
import type { DeskInteraction } from "./interaction";

let labelEl: HTMLElement | null = null;
let container: HTMLElement | null = null;
const _pos = new Vector3();

export function initLabels(containerEl: HTMLElement): void {
	container = containerEl;

	labelEl = document.createElement("div");
	labelEl.className = "desk-label";
	Object.assign(labelEl.style, {
		position: "absolute",
		pointerEvents: "none",
		fontFamily: "'Space Grotesk', sans-serif",
		fontSize: "0.85rem",
		fontWeight: "500",
		letterSpacing: "0.02em",
		textTransform: "uppercase",
		color: "var(--color-cream, #f0ece4)",
		background: "rgba(30, 30, 30, 0.8)",
		backdropFilter: "blur(4px)",
		padding: "0.25rem 0.75rem",
		borderRadius: "0.5rem",
		border: "1px solid rgba(255, 255, 255, 0.1)",
		opacity: "0",
		transform: "translateY(4px)",
		transition: "opacity 0.2s ease, transform 0.2s ease",
		whiteSpace: "nowrap",
		zIndex: "10",
	});
	container.appendChild(labelEl);
}

export function updateLabel(
	interaction: DeskInteraction | null,
	camera: Camera,
	canvas: HTMLCanvasElement,
): void {
	if (!labelEl) return;

	if (!interaction?.label) {
		labelEl.style.opacity = "0";
		labelEl.style.transform = "translateY(4px)";
		return;
	}

	interaction.object.getWorldPosition(_pos);
	_pos.y += 0.5;
	_pos.project(camera);

	const x = (_pos.x * 0.5 + 0.5) * canvas.clientWidth;
	const y = (-_pos.y * 0.5 + 0.5) * canvas.clientHeight;

	if (labelEl.textContent !== interaction.label) labelEl.textContent = interaction.label;
	labelEl.style.left = `${x}px`;
	labelEl.style.top = `${y}px`;
	labelEl.style.transform = "translate(-50%, -100%) translateY(-8px)";
	labelEl.style.opacity = "1";
}

export function disposeLabels(): void {
	labelEl?.remove();
	labelEl = null;
}
