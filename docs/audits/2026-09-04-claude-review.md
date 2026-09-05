# Review of Claude's eight audit fixes — September 4, 2026

The review identified two actionable defects: responsive image URLs broke Photos previews, and the analytics migration lost event properties. Both have now been corrected with regression coverage. The findings below retain the original evidence.

## Resolution before release

The preview sanitizer now separates URL tokens from descriptors, preserving commas within Cloudinary URLs while still removing unsafe schemes. The scene analytics adapter now puts properties under Vercel's `data` field. Seven added regression cases cover transformed image candidates, candidate separators, unsafe data URLs, all three scene events, and unavailable analytics. The new tests first reproduced five failures against the old behavior and then passed after the fixes.

`devcontainer exec --workspace-folder . pnpm run verify` passes with **73 tests across 7 files**, lint, Astro check, and the production build. Built-site Chrome checks confirm both desktop photo covers load, all three images in the mobile camera preview load, and desktop/mobile scene events include the correct labels and destinations under `data`. Escape returns focus to the canvas. Screenshots: [desktop](../../output/playwright/claude-review/photos-preview-fixed.png), [mobile](../../output/playwright/claude-review/photos-preview-fixed-mobile.png).

Scope: Claude-owned changes in the uncommitted `audit-fixes` worktree against `50a42489048bd73f6f9080e7c5d639c0103e3444`, including new untracked helpers and tests. Ownership and requirements come from [coordination.md](coordination.md). Codex's lifecycle, timeout, and legibility changes were excluded from the review findings. Source code was not changed during this review.

## Standards

**No findings.** Claude's changes respect the documented ownership boundaries and focused-change guidance in `AGENTS.md` and `coordination.md`. The schema migration is narrow, and the verification command is documented. Mechanically enforced style/type checks were excluded from this axis and verified separately below.

## Spec

### 1. P1 — Responsive image URLs are corrupted in homepage Photos previews

Requirement: “Cloudinary transform helper and responsive image delivery.”

The new `srcset` in [PhotoCollectionCard.astro:26](../../src/components/PhotoCollectionCard.astro#L26) contains Cloudinary transformation commas such as `f_auto,q_auto,c_limit,w_448`. Existing [preview.ts:89](../../src/modal/preview.ts#L89) splits `srcset` on **every comma**, turning parts of each URL into separate candidates. This was a latent sanitizer problem that the newly generated URLs now trigger.

**Reproduced in Chrome:** open the homepage, focus the scene canvas, press Tab four times to select Photos, then Enter. Both collection covers are broken. Both have `complete: true`, `naturalWidth: 0`, and `currentSrc` ending at `/image/upload/f_auto`. The original valid `src` remains present, but the malformed `srcset` wins candidate selection. [Screenshot](../../output/playwright/claude-review/photos-preview-broken.png).

**Correction:** parse candidates without splitting commas inside URLs, or omit `srcset` from previews until that parser is correct. Add a regression that feeds actual `cloudinarySrcSet()` output through `loadContentPreview()` and checks the preserved candidate URLs. The new [preview.test.ts:139](../../src/modal/preview.test.ts#L139) only exercises a comma-free image URL.

### 2. P2 — Analytics migration drops scene event properties

Requirement: Claude's coordination note says it rerouted all three scene events to preserve them after removing PostHog.

At review time, `unified-scene.ts:161` sent `{ name: event, ...props }`. The installed Vercel SDK and the [production client](https://omer.texerman.com/_vercel/insights/script.js) expect `{ name, data: props }`. The client explicitly reads `t.name`, `t.data`, and `t.options`. The corrected adapter is now in [analytics.ts](../../src/analytics.ts).

**Reproduced in Chrome:** opening Photos emitted `['event', { name: 'desk_object_click', label: 'Photos', href: '/photos' }]`. Calling the installed SDK's `track()` with the same properties emits a nested `data` object instead. Event names survive, but the section label and destination are discarded. Vercel's [custom-event API](https://vercel.com/docs/analytics/custom-events#tracking-an-event-with-custom-data) describes the intended property behavior.

**Correction:** use `{ name: event, data: props }`, or the SDK's `track()` function, and assert the queued payload in a regression test.

## Verification of all eight items

| Item | Assessment | Evidence and limits |
| --- | --- | --- |
| 1. Scene fallback CSS and reduced motion | Passed targeted checks | With WebGL disabled, fallback opacity is 1, pointer events are enabled, and Photos navigation works. With working WebGL and reduced motion, fallback opacity is 0 and it is inert. With JavaScript disabled, the fallback and navigation also work. |
| 2. Cloudinary transforms and responsive delivery | Needs correction | Direct gallery delivery works and is substantially smaller; Photos modal previews fail as described above. |
| 3. Tests and verification command | Gate works; integration coverage incomplete | `pnpm run verify` runs lint, check, test, and build. All 66 tests across 6 files pass. The image/preview interaction and analytics payload are uncovered. The two earlier empty-state/iframe fixture issues are already fixed and are not repeated as open findings. |
| 4. Canonicals and sitemap | Passed | Built `/projects/phone` and `/photos/camera` canonicalize to `/projects` and `/photos`; their Open Graph URLs agree. Both alternate routes are absent from the sitemap, and both primary routes remain present. |
| 5. Analytics consolidation | Needs correction | PostHog references and dependency are removed; Vercel Analytics and Speed Insights remain. Scene event metadata has the payload error above. |
| 6. Live scene labels | Implemented; assistive-technology check outstanding | Built container has `aria-live="polite"` and `aria-atomic="true"`. Keyboard navigation visibly updates Blog → Projects → Reading → Photos → Word of the Day. Enter opens the selected section. Actual announcements were not tested with a screen reader. |
| 7. CMS script SRI | Passed | Fresh HTTP 200 download is 1,611,018 bytes; computed SHA-384 exactly matches the committed markup. The response has `Access-Control-Allow-Origin: *`, matching anonymous cross-origin loading. |
| 8. Astro and dependency upgrade | Build compatibility passed; dependency follow-up remains | Astro 7.3.1, Vercel adapter 11.0.10, content schemas, and the generated Node 22 function pass the combined checks. Reviewed against the [Astro 7 migration guide](https://docs.astro.build/en/guides/upgrade-to/v7/). Hosted deployment, OAuth publishing, and physical-device behavior were not tested. |

The final `devcontainer exec --workspace-folder . pnpm run verify` exited 0. Astro check reported zero errors/warnings and one existing clipboard deprecation hint. The build retains its existing large Three.js chunk warning. Local static serving produces expected 404s for Vercel platform analytics endpoints; the observed malformed analytics payload was captured before delivery.

### Image transfer measurement

On `/photos/i-went-to-paris` at 1440 × 900 and device pixel ratio 1, all seven thumbnails loaded successfully using 480-pixel Cloudinary candidates. Their response bodies totaled **255,210 bytes (249.2 KiB)** versus **9,286,785 bytes (9,069.1 KiB)** for the same original images recorded in the earlier audit: approximately **97.3% smaller**. Six responses were WebP and one was JPEG. This is thumbnail image payload only; higher pixel ratios and opening the lightbox request larger images.

### Dependency and measurement follow-up

The current [registry scan](../../output/playwright/claude-review/dependency-audit.json) reports **28 advisory counts: 1 critical, 18 high, and 9 moderate**, down from 110 in the original audit. These are advisory matches across the dependency tree, not demonstrated exploitable website endpoints. Remaining paths include build/file-tracing dependencies (`tar`, `brace-expansion`, `smol-toml`), test dependencies (`happy-dom`, `ws`, `picomatch`), and language tooling (`fast-uri`). The remaining critical `tar@7.5.11` path comes through `@astrojs/vercel` → `@vercel/nft` → `@mapbox/node-pre-gyp`; the [maintainer advisory](https://github.com/isaacs/node-tar/security/advisories/GHSA-23hp-3jrh-7fpw) concerns processing untrusted archives. No public request path to that operation was established. These are follow-up triage items, not newly demonstrated regressions in this change.

Claude's claimed “~60 KB gzip/page” analytics saving is not established by summing generated JavaScript files. The prior PostHog import was conditional, and the original production audit did not observe it loading. Removing the dependency reduces the dependency tree and potential payload; the bytes a visitor saves depend on whether it previously loaded.

Original review: **0 Standards findings**, **2 Spec findings**. Both Spec findings are resolved in the release follow-up above.
