import { type Camera, Vector3 } from "three";
import type { DeskInteraction } from "./interaction";

export interface LabelController {
	update: (interaction: DeskInteraction | null, camera: Camera, canvas: HTMLCanvasElement) => void;
	dispose: () => void;
}

const labelOffset = new Vector3(0, 0.5, 0);

export function createLabelController(container: HTMLElement): LabelController {
	const labelEl = document.createElement("div");
	const projectedPosition = new Vector3();

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

	function update(
		interaction: DeskInteraction | null,
		camera: Camera,
		canvas: HTMLCanvasElement,
	): void {
		if (!interaction?.label) {
			labelEl.style.opacity = "0";
			labelEl.style.transform = "translateY(4px)";
			return;
		}

		interaction.object.getWorldPosition(projectedPosition);
		projectedPosition.add(labelOffset);
		projectedPosition.project(camera);

		const x = (projectedPosition.x * 0.5 + 0.5) * canvas.clientWidth;
		const y = (-projectedPosition.y * 0.5 + 0.5) * canvas.clientHeight;

		if (labelEl.textContent !== interaction.label) labelEl.textContent = interaction.label;
		labelEl.style.left = `${x}px`;
		labelEl.style.top = `${y}px`;
		labelEl.style.transform = "translate(-50%, -100%) translateY(-8px)";
		labelEl.style.opacity = "1";
	}

	function dispose(): void {
		labelEl.remove();
	}

	return { update, dispose };
}
