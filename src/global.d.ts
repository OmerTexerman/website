interface SceneHandle {
	cleanup: () => void;
	transition: (target: "desktop" | "mobile") => Promise<void>;
}

interface Posthog {
	capture: (event: string, props: Record<string, string>) => void;
}

interface SceneDebugState {
	readonly mode: "desktop" | "mobile";
	readonly targetInterval: number;
	readonly idleInterval: number;
	readonly idleRestoreDelayMs: number;
	readonly isIdle: boolean;
	readonly lastActiveAt: number;
	readonly introComplete: boolean;
	readonly transitioning: boolean;
	readonly isDragging: boolean;
	readonly hasHover: boolean;
	readonly animating: boolean;
	readonly physicsActive: boolean;
	readonly scrolling: boolean;
	readonly contextLost: boolean;
	readonly disposed: boolean;
}

interface Window {
	__sceneHandle?: SceneHandle;
	__sceneDebug?: SceneDebugState;
	posthog?: Posthog;
}
