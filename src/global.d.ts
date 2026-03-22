interface SceneHandle {
	cleanup: () => void;
	transition: (target: "desktop" | "mobile") => Promise<void>;
}

interface Posthog {
	capture: (event: string, props: Record<string, string>) => void;
}

interface Window {
	__sceneHandle?: SceneHandle;
	__unhandledRejectionInstalled?: boolean;
	posthog?: Posthog;
}
