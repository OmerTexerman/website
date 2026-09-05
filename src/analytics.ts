/** Queue scene event properties without importing analytics into the Three.js module. */
export function trackEvent(event: string, props: Record<string, string>): void {
	window.va?.("event", { name: event, data: props });
}
