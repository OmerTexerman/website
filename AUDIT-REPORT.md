# Full Codebase Audit Report

**Date:** 2026-03-22
**Codebase:** Astro + Three.js + Tailwind portfolio website (~10K LOC)
**Audited by:** 10 parallel agents covering type safety, error handling, Three.js performance, web performance, memory management, security, accessibility, integration, simplicity, and framework best practices.

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 13 |
| Warning | 52 |
| Info | (not listed individually — see agent reports for full detail) |

**Overall assessment:** This is a well-engineered codebase with excellent type safety (zero `any` types), robust error handling, thorough memory disposal, strong security practices, and clean module boundaries. The main areas for improvement are: file/function size in the Three.js layer, color contrast for accessibility, CSS loading strategy, and a handful of consistency issues.

---

## Critical Findings

### C-01: `unified-scene.ts` is a 1,387-line monolith
**Category:** Simplicity
**File:** `src/three/unified-scene.ts`

The `initUnifiedScene` function is ~1,178 lines containing ~30 inner functions. It handles scene creation, render loop, input wiring, transition animation, resize, context loss recovery, spotlight popup DOM manipulation, and cleanup — at least 10 distinct responsibilities. The spotlight popup (lines 420–457) directly creates DOM elements inside a Three.js module, violating separation of concerns.

**Recommendation:** Extract into separate modules: render loop, transition logic, desk scene builder, shelf scene builder, spotlight popup, and mobile interaction wiring.

---

### C-02: `muted` text color fails WCAG AA contrast
**Category:** Accessibility
**File:** `src/config.ts:15`, used throughout `src/styles/`

`#8a8a8a` on `#1e1e1e` = ~3.9:1 contrast ratio. WCAG AA requires 4.5:1 for normal text. This color is used for timestamps, metadata, empty states, footer text, and "show more" buttons across the entire site.

Additional low-contrast violations:
- `.camera-model-text` at `rgba(255,255,255,0.25)` on dark = ~2.2:1 (`photos.css:483`)
- `.phone-entry-desc` at `rgba(255,255,255,0.45)` on `#0c0c10` = ~4.0:1 (`phone.css:157`)
- `.camera-meta-detail` at `rgba(255,255,255,0.4)` = ~3.0:1 (`photos.css:619`)

**Recommendation:** Bump `muted` to at least `#a0a0a0` (~5.0:1). Fix the rgba values to meet 4.5:1.

---

### C-03: Homepage skip link is unreachable
**Category:** Accessibility
**Files:** `src/layouts/BaseLayout.astro:63-69`, `src/pages/index.astro:55-59`

The standard skip link is suppressed when `fullscreen=true` (homepage). The homepage's custom skip link ("Skip to navigation") is placed *after* the canvas in DOM order. Since the canvas traps Tab focus, the skip link is unreachable via keyboard.

**Recommendation:** Move the skip link before the `<canvas>` element in the DOM.

---

### C-04: Homepage eagerly loads all section CSS
**Category:** Web Performance
**File:** `src/pages/index.astro:2-8`

The homepage imports all 7 section CSS files (~62KB uncompressed) even though only `global.css` and `spotlight.css` are needed at first paint. The remaining CSS (blog, phone, photos, projects, reading, wotd) is only relevant when the modal opens.

**Recommendation:** Defer section CSS loading or inject it when the modal opens.

---

### C-05: PointLight shadow-casting is extremely expensive
**Category:** Three.js Performance
**File:** `src/three/lighting.ts:53-56`

The `shelfSideFill` PointLight has `castShadow = true`. PointLight shadows require rendering the scene into a 6-face cube map — 6 extra render passes. This fill light (intensity 0.9) almost certainly does not need shadows.

**Recommendation:** Disable `castShadow` on the fill PointLight. Use shadow-casting SpotLights only.

---

### C-06: `mobile-scroll.ts` is 861 lines in a single factory function
**Category:** Simplicity
**File:** `src/three/mobile-scroll.ts`

`createMobileScrollController` is ~685 lines containing ~30 inner functions handling gesture recognition, velocity estimation, rubber-band physics, snap-point resolution, and animation ticking.

**Recommendation:** Decompose into gesture recognition, snap logic, and animation state modules.

---

### C-07: `animations.ts` is 787 lines mixing engine and object animations
**Category:** Simplicity
**File:** `src/three/animations.ts`

Contains the animation engine (`animate`/`tickAnimations`/`disposeAnimations`) plus every object-specific animation. Each animation is self-contained.

**Recommendation:** Split into an animation engine module plus per-object animation files (or at least desk-animations and shelf-animations).

---

### C-08: Duplicated rest-pose save patterns
**Category:** Simplicity / DRY
**File:** `src/three/animations.ts:211-232, 354-375`

`animateBookLift` and `animateBookClose` duplicate ~20 lines of identical `saveRest` calls. `animateDictionaryOpen`/`Close` have the same duplication pattern.

**Recommendation:** Extract a shared `saveBookRestPose(parts)` helper.

---

### C-09: `safeJson` helper duplicated in 3 components
**Category:** Integration / DRY
**Files:** `src/components/SEOHead.astro:16`, `src/components/SceneCanvas.astro:8`, `src/components/PhotoGallery.astro:11`

All three define the identical JSON-escaping function. If a future copy forgets the `</script>` escaping, it becomes an injection vector.

**Recommendation:** Extract to `src/utils.ts`.

---

### C-10: `<time>` elements missing `datetime` attribute
**Category:** Accessibility
**Files:** `src/components/BlogCard.astro:16`, `src/pages/projects/index.astro:32`

BlogCard's `<time>` has no `datetime` attribute (compare with `BlogPost.astro:40` which does it correctly). The projects page live clock sets `textContent` but never sets `datetime`.

**Recommendation:** Add `datetime={pubDate.toISOString()}` to BlogCard. Set `datetime` in the projects clock JS.

---

### C-11: Content schema permissiveness mismatches runtime guards
**Category:** Type Safety / Content
**Files:** `src/content.config.ts:63,81-84,108-110`, `src/content/types.ts:13`

`photos.title`, `spotlight.title`, `words.word`, and `words.quip` use `z.string()` without `.min(1)`, unlike `blog` and `projects`. The runtime type guard in `types.ts` checks `trim().length > 0`, meaning a whitespace-only title passes Zod but fails the runtime guard — a silent data inconsistency.

**Recommendation:** Add `.min(1)` (or `.trim().min(1)`) to match runtime behavior.

---

### C-12: Permanent `unhandledrejection` listener never removed
**Category:** Memory Management
**File:** `src/dom/scene-app.ts:11-16`

The listener is added once per session (guarded by a flag) but never removed. Minor memory impact but breaks cleanup symmetry and bfcache listener parity.

**Recommendation:** Track the handler and remove it during cleanup.

---

### C-13: Three.js `userData` used as untyped property bag
**Category:** Type Safety
**Files:** `src/three/objects/*.ts`, `src/three/animations.ts`, `src/three/unified-scene.ts`

7+ files store typed data in `Object3D.userData` (which is `Record<string, any>`) and retrieve it via `as` casts. Properties include `clockParts`, `cups`, `screenMaterial`, `candleParts`, `lightParts`, `lampOn`, `candleLit`, `shared`, `interactive`, `href`, `label`. No central type map exists — a typo or refactor would fail silently at runtime.

**Recommendation:** Use a `WeakMap<Object3D, TypedData>` sidecar or typed wrapper functions.

---

## Warning Findings

### Type Safety (6)

| ID | File | Issue |
|----|------|-------|
| W-01 | `utils.ts:2-4` | `isRecord()` accepts arrays as records. Add `!Array.isArray(value)`. |
| W-02 | `content.config.ts:109` | `words.partOfSpeech` accepts empty string (differs from `undefined`). |
| W-03 | `content.config.ts:40` | `projects.post` (blog slug reference) has no validation. |
| W-04 | `content.config.ts:6-10` | `optionalPhoto` transform uses `v \|\| undefined` which is falsy-coercing, not empty-string-specific. |
| W-05 | `three/objects/shelf-wall.ts:67` | `source?: string` should be `source?: "phone" \| "camera"` union. |
| W-06 | `content/selectors.ts:26,58` | Exported async functions missing explicit return type annotations. |

### Error Handling (5)

| ID | File | Issue |
|----|------|-------|
| W-07 | `unified-scene.ts:848` | Empty `.catch(() => {})` on shelf animation chain silences all errors. |
| W-08 | `scene-app.ts:243-244` | `transition()` failure skips `activeMode` assignment, leaving mode state inconsistent. |
| W-09 | `modal/preview.ts:23` | Fetch timeout managed externally (10s) but not locally via `AbortSignal.timeout()`. |
| W-10 | `unified-scene.ts:570-1197` | Multiple fire-and-forget animation promises rely solely on global rejection handler. |
| W-11 | `spotlight-frame.ts:109-111` | Spotlight image load failure is log-only, no visual error state. |

### Three.js Performance (10)

| ID | File | Issue |
|----|------|-------|
| W-12 | `objects/laptop.ts:82-88` | 60 keyboard key meshes — candidate for `InstancedMesh`. |
| W-13 | `objects/book-stack.ts:137-151` | 20 loose page meshes with 22 cloned materials (only 3 distinct colors). |
| W-14 | `objects/dictionary.ts:128-165` | Up to 160 segment meshes + 160 nested Groups for page articulation. |
| W-15 | `objects/shelf-clock.ts:74-84` | 12 tick-mark meshes with same geometry — candidate for instancing. |
| W-16 | `materials.ts:74-80` | `createBookMaterial()` creates fresh material on every call, never shared. |
| W-17 | `objects/circuit-board.ts:18-56` | 3 per-call materials never mutated — could be shared. |
| W-18 | `objects/laptop.ts:36-97` | 6 per-call materials, most never mutated. |
| W-19 | `camera.ts:69` | `window.matchMedia()` called every frame in `idleFloat` — should be cached. |
| W-20 | `drag.ts:299-302` | Hover raycast during drag-idle not throttled by `requestAnimationFrame`. |
| W-21 | `spine-texture.ts:32-34` | Canvas scale defaults to 4 — excessive for mobile, scale 2 would suffice. |

### Web Performance (4)

| ID | File | Issue |
|----|------|-------|
| W-22 | `unified-scene.ts:1-96` | Three.js chunk is monolithic (~400-600KB). Postprocessing and mobile/desktop paths could be split. |
| W-23 | `BaseLayout.astro:47` | JetBrains Mono preloaded (31KB) on every page despite being used only for small UI labels. |
| W-24 | Components (multiple) | No `srcset`/`sizes` on any `<img>`. Mobile downloads full-resolution images. |
| W-25 | Components (multiple) | No modern image formats (WebP/AVIF). Astro `<Image>` component not used. |

### Memory Management (2)

| ID | File | Issue |
|----|------|-------|
| W-26 | `ContentHeader.astro:49-55` | Two window listeners (`pageshow`, `visibilitychange`) not cleaned up on view transitions. |
| W-27 | `projects/index.astro:228-261` | Typewriter `setTimeout` chain not tracked by `clearTimers()`. Persists across view transitions. |

### Security (4)

| ID | File | Issue |
|----|------|-------|
| W-28 | `vercel.json:8` | `script-src 'unsafe-inline'` weakens XSS protection. Required by Astro inline scripts. |
| W-29 | `modal/controller.ts:339` | `innerHTML` relies entirely on `sanitizeNode()` correctness. Any bypass is exploitable. |
| W-30 | `projects/index.astro:251` | `insertAdjacentHTML` for fastfetch effect. Input is hardcoded but eliminable with DOM APIs. |
| W-31 | `public/admin/config.yml` | No server-side auth on `/admin` beyond GitHub OAuth. CMS UI loads for any visitor. |

### Accessibility (11)

| ID | File | Issue |
|----|------|-------|
| W-32 | `projects/index.astro:91` | Heading hierarchy skips h2 (h1 → h3). |
| W-33 | `projects/index.astro:17-23` | i3bar workspace links not wrapped in `<nav>`. |
| W-34 | `SetupWindow.astro:29-33` | Setup items should use `<dl>` for semantics. |
| W-35 | `ContentHeader.astro:41` | `aria-current="false"` should be removed, not set to "false". |
| W-36 | `interaction.ts:123` | Canvas Tab trap not discoverable — no instructions for Escape to exit. |
| W-37 | `photos.css:377-381` | Lightbox nav buttons hidden on mobile with no visible keyboard alternative. |
| W-38 | `content-list.ts:67-76` | "Show more" button text update not announced to screen readers. |
| W-39 | `ContentModal.astro:7` | Uses `<div>` instead of native `<dialog>` element. |
| W-40 | `photos.css:319`, `693`, `ContentHeader:9` | Touch targets below 44px minimum (lightbox close: 36px, camera btn: 32px, logo: 36px). |
| W-41 | `phone.astro:41-46` | Phone page action links at 9px font with no minimum touch target size. |
| W-42 | `projects/index.astro:241-251` | Fastfetch color spans have no text/ARIA — confusing for screen readers. |

### Integration & Consistency (4)

| ID | File | Issue |
|----|------|-------|
| W-43 | `global.css:121-138, 311` | Hardcoded hex colors outside the centralized `brandTheme` / CSS variable system. |
| W-44 | `scene-app.ts` | Inconsistent console log prefixes — mixes `[scene]` with unprefixed messages. |
| W-45 | `animations.ts`, `camera.ts`, `mobile-scroll.ts`, `unified-scene.ts` | `prefersReducedMotion` queried independently in 4 places. Should cache. |
| W-46 | `unified-scene.ts:365-398` | `syncMobileShelfCamera` and `writeMobilePose` are near-duplicates. |

### Simplicity & Maintainability (4)

| ID | File | Issue |
|----|------|-------|
| W-47 | `modal/controller.ts` | 448 lines; `createContentModalController` spans ~370 lines internally. |
| W-48 | `drag.ts` | 427 lines mixing physics simulation and drag interaction wiring. |
| W-49 | `animations.ts` (multiple) | Magic numbers in animation callbacks (e.g., `p / 0.28`, `restX - 0.095`). |
| W-50 | `camera.ts:79-90`, `interaction.ts:41-52`, `drag.ts:166-172` | Functions with 5-6 positional parameters — should use options objects. |

### Astro & Framework (2)

| ID | File | Issue |
|----|------|-------|
| W-51 | Multiple files | `astro:before-preparation` listeners are dead code without `<ClientRouter />`. Not a bug (pagehide covers teardown), but misleading. |
| W-52 | `content/selectors.ts:34,47` | Duplicate `getCollection("books")` calls across two functions. |

---

## Strengths

This codebase does many things exceptionally well:

- **Zero `any` types** — the entire codebase is strictly typed with no escape hatches
- **Zero circular dependencies** — clean unidirectional import graph
- **Thorough Three.js disposal** — geometries, materials, textures all cleaned up; canvas sources shrunk to 1x1 to release bitmap memory
- **Excellent bfcache handling** — no `beforeunload` listeners; proper `pagehide`/`pageshow` lifecycle with canvas context-loss detection and re-creation
- **Robust error handling** — WebGL context loss recovery with retry, fallback UI for no-JS/no-WebGL, 3-second timeout, graceful degradation throughout
- **Strong security** — comprehensive HTML sanitizer for modal previews, same-origin URL validation, CSP/HSTS/X-Frame-Options, JSON injection prevention
- **Consistent patterns** — every `mount*` returns a cleanup function, consistent lifecycle teardown, consistent data-attribute bridge for server→client data
- **Motion preferences** — `prefers-reduced-motion` respected in CSS, JS animations, Three.js camera, scroll controller, and modal transitions
- **Clean module boundaries** — `three/`, `dom/`, `modal/` never reach into each other's internals
- **No dead code** — no TODO/FIXME/HACK markers, no commented-out code, all exports are consumed
- **Content security** — Zod schemas with regex validation, runtime type guards, URL protocol restrictions
- **SEO** — canonical URLs, OpenGraph, Twitter cards, JSON-LD structured data, RSS, sitemap, robots.txt
