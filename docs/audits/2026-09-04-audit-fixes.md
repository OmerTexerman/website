# Website audit fixes — September 4, 2026

This report records the first implementation pass on `audit-fixes`, before the independent review and release. Ownership and messages exchanged with Claude are in [coordination.md](coordination.md). The [original audit](2026-09-04-website-audit.md) records the site before these changes; the [Claude review](2026-09-04-claude-review.md) includes the subsequent integration fixes and final 73-test verification.

## Implemented by Codex

- **Browser Back and Forward:** content lists, photo galleries, page reveal/back-link behavior, and project UI preserve their handlers and state while the browser caches the document. A shared `onPageLeave` helper still disposes them on permanent departure or Astro navigation. Homepage scene teardown and modal bootstrap keep their existing remount behavior.
- **Preview recovery:** previews announce a readable loading status and show a recoverable error after a 10-second timeout. Visitors can retry or open the full page. Retry preserves the original focus return target; cancelled and superseded requests cannot replace newer content.
- **Legibility and access:** larger project/setup text, improved contrast for functional labels and actions, a labelled keyboard-scrollable setup region, and clearer camera metadata/filmstrip labels. Photo viewers expose previous/next controls on phones, with 44-pixel controls and space between captions and counters.
- **Search empty state:** zero matches now explicitly show the message instead of falling back to a stylesheet rule that hides it. Both list and lifecycle regression fixtures include that rule and assert computed visibility.
- **Regression coverage:** nine tests cover cached search and pagination, permanent cleanup, preview loading, timeout/retry, focus return, close/cancellation, stale responses, and disposal. A minimal correction to Claude's iframe sanitization fixture keeps its removal assertion while preventing an unintended network request during parsing.

Claude marked all eight assigned items complete: scene fallback/reduced motion, responsive Cloudinary delivery, utility and preview/list tests, canonical/sitemap handling, analytics consolidation, scene announcements, CMS script integrity, and the Astro/dependency upgrade. The final verification below ran against both agents' changes together.

## Verification

`devcontainer exec --workspace-folder . pnpm run verify` exited successfully after the last source change:

| Check | Result |
| --- | --- |
| Biome lint | Passed |
| Astro check | Zero errors and warnings; one existing clipboard deprecation hint |
| Vitest | 66 tests passed across 6 files; no iframe network stack traces |
| Production build | Passed; existing large Three.js chunk warning remains |

Browser checks used the built static output in Chrome, served locally without HMR so real back/forward caching could be tested. The local server does not implement Vercel Analytics/Speed Insights platform endpoints, which produce expected local 404s.

| Browser scenario | Observed result |
| --- | --- |
| Reading → Blog → Back, twice | Actual `pageshow.persisted` values `[true, true]`; both Dostoevsky matches retained; new query shows zero-match message; clearing restores all 9 books |
| Photo collection → Blog → Back | Gallery opens, ArrowRight advances to 2/7, Escape closes and returns focus to the original photo |
| Projects → Blog → Back | Clock continues updating and pane interaction still updates the focused title |
| Hold a Blog preview request past 10 seconds | Timeout message appears; retry loads Blog; Escape closes and restores focus to the scene canvas |
| Mobile photo viewer at 390 px | Visible previous/next/close controls; next advances to 2/7; measured next and close controls are 44 × 44 px |
| Projects, camera, and word views at 320 and 768 px | No horizontal page overflow |
| Targeted axe checks | Addressed functional contrast, heading, ARIA, and keyboard-scroll-region findings pass; OT logo and decorative camera-model contrast remain flagged |
| Homepage without WebGL | Fallback is visible and interactive; Blog navigation works |
| Homepage with reduced motion and working WebGL | Fallback is hidden and inert after scene initialization |

Screenshots: [search after Back](../../output/playwright/website-fixes/reading-after-back.png), [timeout recovery](../../output/playwright/website-fixes/preview-timeout.png), [mobile gallery controls](../../output/playwright/website-fixes/photo-controls-mobile.png), [desktop projects](../../output/playwright/website-fixes/projects-desktop.png), [320 px projects](../../output/playwright/website-fixes/projects-320.png), [camera](../../output/playwright/website-fixes/mobile-photos-camera.png), [WebGL fallback](../../output/playwright/website-fixes/fallback-no-webgl.png).

## Still open from the audit

This pass does not close every recommendation in the original audit. Homepage introduction/navigation and the canvas keyboard model, project-first hierarchy, sharing images, and publishing/input contracts remain follow-up work. The configured `pnpm preview` workflow and dependency-advisory status after the upgrade were not reassessed in this pass. The browser checks are local Chrome checks, including mobile emulation; they do not establish field performance, assistive-technology compatibility, or full accessibility conformance.
