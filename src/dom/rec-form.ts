/**
 * The "feed me slop" form (components/RecForm.astro). Cloudflare Turnstile,
 * the bot check, loads once someone starts filling it in; sending posts to
 * /api/recommend.
 *
 * Mounted on /slop and again whenever the content modal renders it (the
 * modal preview runs no scripts).
 */

import { isRecKind } from "../recs";

interface Turnstile {
	render(el: HTMLElement, options: Record<string, unknown>): string;
	reset(id: string): void;
	remove(id: string): void;
}

declare global {
	interface Window {
		turnstile?: Turnstile;
	}
}

const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let turnstileLoad: Promise<Turnstile> | null = null;

function loadTurnstile(): Promise<Turnstile> {
	if (window.turnstile) return Promise.resolve(window.turnstile);
	turnstileLoad ??= new Promise<Turnstile>((resolve, reject) => {
		const script = document.createElement("script");
		script.src = TURNSTILE_SRC;
		script.async = true;
		script.onload = () =>
			window.turnstile ? resolve(window.turnstile) : reject(new Error("no turnstile"));
		script.onerror = () => {
			turnstileLoad = null;
			script.remove();
			reject(new Error("turnstile failed to load"));
		};
		document.head.append(script);
	});
	return turnstileLoad;
}

export function mountRecForm(root: ParentNode = document): () => void {
	const section = root.querySelector<HTMLElement>("[data-rec]");
	const form = section?.querySelector<HTMLFormElement>("[data-rec-form]");
	const check = section?.querySelector<HTMLElement>("[data-rec-captcha]");
	const submit = section?.querySelector<HTMLButtonElement>("[data-rec-submit]");
	const status = section?.querySelector<HTMLElement>("[data-rec-status]");
	if (!section || !form || !check || !submit || !status) return () => {};

	const events = new AbortController();
	const siteKey = section.dataset.siteKey ?? "";
	let widgetId: string | null = null;
	let token = "";
	let sending = false;

	const say = (text: string, tone: "info" | "error" | "done" = "info") => {
		status.textContent = text;
		status.dataset.tone = tone;
	};

	// Fill in the pad: today's date, and a check number of its own.
	const date = section.querySelector<HTMLElement>("[data-rec-date]");
	if (date) {
		date.textContent = new Date().toLocaleDateString(undefined, {
			month: "numeric",
			day: "numeric",
		});
	}
	const number = String(Math.floor(10000 + Math.random() * 89999)).padStart(5, "0");
	for (const el of section.querySelectorAll<HTMLElement>("[data-rec-number]"))
		el.textContent = number;

	// The maker's label follows the kind: author, director, channel…
	const byLabel = form.querySelector<HTMLElement>("[data-rec-by]");
	const syncByLabel = () => {
		const picked = form.querySelector<HTMLInputElement>("input[name=kind]:checked");
		if (byLabel && picked) byLabel.textContent = picked.dataset.by ?? "by";
	};
	// `/slop?kind=book` (the bookcase's link) starts on that kind.
	const wanted = new URLSearchParams(location.search).get("kind");
	if (isRecKind(wanted)) {
		const radio = form.querySelector<HTMLInputElement>(`input[name=kind][value="${wanted}"]`);
		if (radio) radio.checked = true;
	}
	syncByLabel();
	form.addEventListener("change", syncByLabel, { signal: events.signal });

	const renderCheck = async () => {
		if (widgetId) return;
		if (!siteKey) {
			say("recommendations aren't set up yet.", "error");
			return;
		}
		try {
			const turnstile = await loadTurnstile();
			if (events.signal.aborted || widgetId) return;
			widgetId = turnstile.render(check, {
				sitekey: siteKey,
				theme: "light",
				// The full-width widget needs 300px inside the form's padding; narrow phones get the small one.
				size: form.clientWidth >= 350 ? "flexible" : "compact",
				callback: (value: string) => {
					token = value;
				},
				"expired-callback": () => {
					token = "";
				},
				"error-callback": () => {
					token = "";
				},
			});
		} catch {
			say("couldn't load the bot check. try reloading?", "error");
		}
	};
	form.addEventListener("focusin", () => void renderCheck(), {
		signal: events.signal,
		once: true,
	});

	form.addEventListener(
		"submit",
		async (event) => {
			event.preventDefault();
			if (sending) return;
			const data = Object.fromEntries(new FormData(form)) as Record<string, string>;
			if (!data.title?.trim()) {
				say("it needs a title at least.", "error");
				form.querySelector<HTMLInputElement>("input[name=title]")?.focus();
				return;
			}
			if (!token) {
				void renderCheck();
				say("one sec, still checking you're not a bot.", "error");
				return;
			}

			sending = true;
			submit.disabled = true;
			say("sending…");
			try {
				const res = await fetch("/api/recommend", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ ...data, turnstileToken: token }),
				});
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				if (!res.ok) throw new Error(body.error || "something went wrong. try again?");
				const kind = data.kind;
				form.reset();
				// Keep the kind they were on, for another helping.
				const radio = form.querySelector<HTMLInputElement>(`input[name=kind][value="${kind}"]`);
				if (radio) radio.checked = true;
				syncByLabel();
				say("got it, thank you! I'll take a look.", "done");
			} catch (error) {
				say(error instanceof Error ? error.message : "something went wrong. try again?", "error");
			} finally {
				// Each token works once; get a fresh one for another go.
				token = "";
				if (widgetId) window.turnstile?.reset(widgetId);
				sending = false;
				submit.disabled = false;
			}
		},
		{ signal: events.signal },
	);

	return () => {
		events.abort();
		if (widgetId) window.turnstile?.remove(widgetId);
		widgetId = null;
	};
}
