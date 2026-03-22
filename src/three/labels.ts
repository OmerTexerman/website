import { type Camera, Vector3 } from "three";
import type { DeskInteraction } from "./interaction";

export interface LabelController {
	update: (
		interaction: DeskInteraction | null,
		camera: Camera,
		canvasWidth: number,
		canvasHeight: number,
	) => void;
	dispose: () => void;
}

const labelOffset = new Vector3(0, 0.5, 0);

export function createLabelController(container: HTMLElement): LabelController {
	const labelEl = document.createElement("div");
	const projectedPosition = new Vector3();

	labelEl.className = "desk-label";
	container.appendChild(labelEl);

	function update(
		interaction: DeskInteraction | null,
		camera: Camera,
		canvasWidth: number,
		canvasHeight: number,
	): void {
		if (!interaction?.label) {
			labelEl.style.opacity = "0";
			labelEl.style.transform = "translateY(4px)";
			return;
		}

		interaction.object.getWorldPosition(projectedPosition);
		projectedPosition.add(labelOffset);
		projectedPosition.project(camera);

		const x = (projectedPosition.x * 0.5 + 0.5) * canvasWidth;
		const y = (-projectedPosition.y * 0.5 + 0.5) * canvasHeight;

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
