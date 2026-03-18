import type { Object3D } from "three";
import { getSectionById, type SectionId } from "../config";

export function applySectionInteraction(root: Object3D, sectionId: SectionId): void {
	const section = getSectionById(sectionId);
	root.userData = {
		...root.userData,
		interactive: true,
		sectionId,
		href: section.href,
		label: section.label,
	};
}
