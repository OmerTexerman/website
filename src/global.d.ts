interface SceneHandle {
	cleanup: () => void;
	transition: (target: "desktop" | "mobile") => Promise<void>;
}

/** The event queue installed by @vercel/analytics. */
type VercelAnalytics = (
	command: "beforeSend" | "event" | "pageview",
	payload: Record<string, unknown>,
) => void;

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
	va?: VercelAnalytics;
}
