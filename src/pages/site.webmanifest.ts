import { webManifest } from "../config";

export function GET() {
	return new Response(JSON.stringify(webManifest), {
		headers: {
			"Content-Type": "application/manifest+json",
		},
	});
}
