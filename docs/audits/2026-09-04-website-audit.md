# Website audit — September 4, 2026

Audited **https://omer.texerman.com** and the repository at `50a42489048bd73f6f9080e7c5d639c0103e3444`. This report covers design, navigation, mobile use, accessibility, resilience, performance, content, search previews, code structure, dependencies, and development checks.

The site has a clear personality. The desk, reading shelves, notebook pages, photo prints, and terminal theme give the content a coherent personal setting. The best direction is to preserve that character while making entry, navigation, and recovery more dependable.

The largest problems are **a broken WebGL fallback, interactions that stop working after browser Back, and oversized photo downloads**. These have stronger evidence and more immediate consequences than a visual redesign. The homepage also asks a new visitor to infer almost everything: whose site this is, what is interactive, and how to browse on a phone.

I evaluated this primarily as a personal website and playful portfolio, based on its content and README. Design recommendations are informed judgments rather than findings from interviews or conversion data. No application code or dependencies were changed during this audit.

## Priorities

P1 means fix or investigate soon because a main journey fails, access is impaired, or maintenance risk warrants prompt triage. P2 means the next improvement pass. P3 means focused follow-up as the site grows. There is no claim here of a confirmed critical production exploit.

| ID | Priority | Finding | Evidence |
| --- | --- | --- | --- |
| 01 | P1 | WebGL failure leaves a blank homepage; reduced motion exposes an inert fallback | Browser reproduction and source |
| 02 | P1 | Reading search and photo lightboxes break after back/forward cache restoration | Browser reproduction with `pageshow.persisted === true` and source |
| 03 | P1 | Gallery thumbnails download original photos; Paris transfers about 9 MB | Network inspection, source, Lighthouse |
| 04 | P1 | Dependency advisories need triage and updates | Installed lockfile scan; exploitability not established |
| 05 | P2 | Homepage identity and navigation are hard to discover | Desktop/mobile visual and interaction review |
| 06 | P2 | Canvas keyboard navigation has weak semantics and an undisclosed exit | Keyboard reproduction and source |
| 07 | P2 | Small text and contrast problems in the terminal, camera, and word themes | axe measurements and visual review |
| 08 | P2 | A preview timeout leaves the loading spinner indefinitely | Browser fault injection and source |
| 09 | P2 | The test gate fails, and the configured production preview returns 404s | Commands run in the devcontainer |
| 10 | P2 | Default sharing and home-screen images are blank dark rectangles | Local asset inspection and route metadata |
| 11 | P2 | Projects gives more visual emphasis to the setup theme than the project | Desktop/mobile visual review |
| 12 | P3 | Preview URLs, duplicate page variants, lifecycle ownership, and publishing rules need clearer contracts | Source review and selected browser checks |

## Reproducible findings and recommendations

### 01. Make fallback visibility, interaction, and accessibility agree

**Observed:** With JavaScript enabled but WebGL contexts unavailable, the homepage becomes a blank dark page. After initialization fails, the root reports `data-scene-fallback="visible"`, but computed fallback styles remain `opacity: 0` and `pointer-events: none`.

The opposite mismatch occurs with reduced motion. The scene initializes successfully and the fallback becomes `inert` and `aria-hidden="true"`, but the reduced-motion stylesheet forces it to be visually opaque. Visitors see an introduction and navigation panel whose links cannot be activated by pointer or keyboard.

**Cause:** [global.css](../../src/styles/global.css), lines 184–187, unconditionally hides the fallback. Nothing in the stylesheet consumes the `sceneFallback` flag set in [scene-app.ts](../../src/dom/scene-app.ts), around lines 220–225. The reduced-motion rule around CSS lines 382–386 separately forces opacity to one. The JavaScript helper around lines 120–128 changes accessibility attributes without changing the visual state.

**Fix:** Give the fallback one explicit state that controls opacity, pointer events, `inert`, and `aria-hidden` together. Show usable HTML navigation when scene loading or initialization fails. Decide whether reduced motion should retain a still scene or use the HTML introduction, then implement that choice consistently. Keep the existing no-JavaScript route, which does display usable navigation.

**Acceptance:** Test normal startup, JavaScript disabled, blocked scene import, unavailable WebGL, reduced motion, and context loss/recovery. Every state must expose either working scene navigation or working HTML links.

Evidence: [WebGL unavailable](../../output/playwright/website-audit/home-no-webgl.png), [reduced motion](../../output/playwright/website-audit/home-reduced-motion.png), [JavaScript disabled](../../output/playwright/website-audit/home-no-js.png).

### 02. Restore page interactions after browser Back

**Observed:** On Reading, searching for “Dostoevsky” correctly filters the books. Navigate to Blog through the header and use browser Back. A real back/forward cache restoration leaves the search text present while all nine books are shown. Changing the query to `zzzzzznotabook` still leaves all nine visible, without an empty-state message. This also reproduced in phone emulation.

On a photo collection, opening, advancing, closing, and restoring focus work on a fresh visit. Navigate to Blog and Back, and clicking a photo no longer opens the viewer. The restored page reports `pageshow.persisted === true` and the gallery mount marker is gone.

**Cause:** [content-list-boot.ts](../../src/dom/content-list-boot.ts), line 25, and [PhotoGallery.astro](../../src/components/PhotoGallery.astro), lines 98–104, clean up on `pagehide` without a matching restoration path. Reading cleanup also resets every item to visible in [content-list.ts](../../src/dom/content-list.ts), lines 149–159. Similar cleanup-only patterns exist in the base layout and project scripts.

The browser restores the page and JavaScript heap from its back/forward cache; initial module execution does not simply repeat. A `pageshow` restoration path is therefore necessary when teardown removed behavior. [Browser lifecycle reference](https://web.dev/articles/bfcache).

**Fix:** Adopt a shared, idempotent mount/cleanup convention with symmetric `pageshow` handling, or retain appropriate DOM listeners while a page is cached. Reapply the current search value when mounting. Review reveal observers, contextual back links, and project timers under the same lifecycle rule.

**Acceptance:** Search → navigate away → Back → edit search; gallery → navigate away → Back → open/advance/close. Verify actual cache restoration, not only a fresh document load. The homepage already has a restoration handler and successfully reopens the Photos preview after visiting its full page and returning; use that existing approach as a reference.

Evidence: [Reading after Back](../../output/playwright/website-audit/reading-search-after-back.png), [phone after editing the restored search](../../output/playwright/website-audit/reading-search-after-back-mobile.png).

### 03. Deliver images at their displayed size

**Observed:** Gallery images use their original source URLs for thumbnails, without responsive variants. The 13 gallery JPEGs inspected range from roughly 0.63 MB to 2.01 MB each. The seven Paris originals total approximately 9.3 MB. Even the camera page's small filmstrip images point at original collection covers.

The Paris mobile Lighthouse run transferred **9,235 KiB** and recorded **14.4 seconds LCP**. Its image-delivery audit estimated **8,855 KiB** of potential savings. These are lab measurements, but the oversized source files are directly verifiable.

**Cause:** [PhotoGallery.astro](../../src/components/PhotoGallery.astro), lines 24–30, uses `src={photo.src}` with no `srcset` or `sizes`, marks every grid image lazy, and assigns every image the same 600 × 400 dimensions. [PhotoCollectionCard.astro](../../src/components/PhotoCollectionCard.astro) and [camera.astro](../../src/pages/photos/camera.astro) have the same original-image delivery pattern. No responsive image markup was found in the generated image-bearing pages.

**Fix:** Add a small image URL helper for Cloudinary width variants, automatic format, and quality. Supply `srcset`/`sizes` for grid, cover, and filmstrip uses. Preserve the actual aspect ratio in intrinsic dimensions. Load the image likely to become LCP eagerly; lazy-load later images. Fetch the larger viewer version when needed. Cloudinary already supports the required resize, format, and quality transformations. [Cloudinary image optimization](https://cloudinary.com/documentation/image_optimization).

**Acceptance:** Compare the same photos at desktop and phone sizes, then rerun the Paris trace. Set a substantially smaller initial-view byte budget, and check that optimization preserves the intentional softness and grain of the photography.

Evidence: [image response sizes](../../output/playwright/website-audit/image-responses.json), [Paris Lighthouse report](../../output/playwright/website-audit/lighthouse-photos-mobile.report.html).

### 04. Update dependencies with a reachability review

`pnpm audit` reported **110 advisory counts: 2 critical, 46 high, 53 moderate, and 9 low**, across the installed dependency tree. This includes development, build, transitive, and optional browser functionality. It is not a count of exploitable website endpoints.

Examples worth following through:

| Installed package/path | Reported concern | Practical interpretation |
| --- | --- | --- |
| `protobufjs@7.5.4`, through PostHog/OpenTelemetry | Critical advisory involving attacker-controlled schema/code generation | Verify whether the affected operation is reachable; the optional PostHog bundle was not observed loading on the tested production homepage. [Maintainer advisory](https://github.com/protobufjs/protobuf.js/security/advisories/GHSA-xq3m-2v4x-88gg). |
| `tar@7.5.11`, through Vercel file tracing / node-pre-gyp | Critical decompression denial of service | Primarily a build dependency path here; this audit did not establish a public request path to it. [Maintainer advisory](https://github.com/isaacs/node-tar/security/advisories/GHSA-23hp-3jrh-7fpw). |
| `@astrojs/vercel@10.0.1` | Registry flags an adapter path-override advisory | Registry and vendor affected-version descriptions differ at the boundary. Update the adapter and verify deployed routing rather than assuming a demonstrated bypass. [Astro advisory](https://github.com/withastro/astro/security/advisories/GHSA-mr6q-rp88-fx84). |
| `astro@6.0.8`, RSS, and build/test utilities | Multiple additional advisories | Review the current supported upgrade path and all remaining advisories after updating. |

**Fix:** Update direct packages and the lockfile in a focused maintenance change, inspect remaining dependency paths, and rerun lint, check, build, and browser smoke checks. Some advisories require more than the first patched version listed for an individual issue. Avoid treating an audit-force update as a substitute for checking compatibility.

Evidence: [dependency summary with versions, paths, and advisory links](../../output/playwright/website-audit/dependencies.json).

### 05. Give the homepage a visible introduction and way to browse

**Observed:** The normal desktop view shows the desk in the lower part of a large dark composition. There is no persistently visible name, short introduction, navigation, or instruction. Name and biography exist in the hidden fallback. The text navigation appears when keyboard-focused, but a pointer visitor has to discover the objects by hovering or clicking.

On a phone, the shelf fills the viewport and extends beyond it. Touch scrolling works, and tapping the notebook opens Blog, but the initial view does not explain that the shelf scrolls or which objects lead to content. Decorative and functional objects share much of the same visual language.

**Recommendation:** Add a modest name/introduction and a persistent “Browse” control or compact set of links. A short first-visit hint can identify the desk objects and shelf gesture. Show section labels on touch in a way that does not rely on hover. Include Word of the Day in the ordinary navigation if it is intended to be readily discoverable; currently the four main text links omit it.

The 3D scene can remain the visual centerpiece. A small amount of orientation would help first-time visitors without flattening the site into a standard portfolio template. If hiring becomes the primary goal, give Projects and a contact/profile link greater prominence.

Evidence: [desktop homepage](../../output/playwright/website-audit/home-desktop.png), [phone homepage](../../output/playwright/website-audit/home-mobile-tall.png), [shelf after swiping](../../output/playwright/website-audit/home-mobile-swiped.png).

### 06. Improve the canvas keyboard model and touch discoverability

**Observed:** Once focused on the canvas, successive Tab presses cycle Blog → Projects → Reading → Photos → Word of the Day → Blog. Focus stays on `scene-canvas`, and its accessible name never changes. The changing object label is an ordinary `div`, without a live announcement or an active-descendant relationship. Escape does release focus, but the canvas instructions do not mention it.

**Source:** [interaction.ts](../../src/three/interaction.ts), lines 121–142; [labels.ts](../../src/three/labels.ts); [SceneCanvas.astro](../../src/components/SceneCanvas.astro).

**Recommendation:** Prefer real DOM links/buttons for the destinations. If the scene keeps a composite keyboard interaction, use a deliberate arrow-key model, announce the selected destination, document activation/exit, and allow Tab to continue through the page normally. Keep the existing skip link: Tab → Enter → Tab → Enter successfully reached Blog, with a visible focus outline and revealed text navigation.

Do not interpret the looping Tab behavior alone as a proven WCAG keyboard-trap failure: Escape works, and W3C recognizes Escape as a possible standard exit. The verified issue is the interaction model and its weakly exposed state; a human screen-reader pass remains necessary. [W3C keyboard-trap guidance](https://www.w3.org/WAI/WCAG22/Understanding/no-keyboard-trap.html).

On mobile, the photo viewer hides its previous/next buttons below the breakpoint. Horizontal swiping works and closing returns focus correctly, but the counter alone does not explain the gesture. Retain compact previous/next buttons or add a clear swipe cue. This also makes one-handed use easier.

### 07. Increase legibility in the detailed themes

The paper blog and most ordinary content text are comfortably readable. The weaker areas are the small decorative-interface text that also carries meaningful information.

| Area | Measured examples | Improvement |
| --- | --- | --- |
| Projects desktop | Inactive navigation: 3.82:1 at 10 px; setup details: 3.13:1 at 10 px; active label white/coral: 3.17:1 | Raise text contrast and meaningful text size; preserve terminal styling through spacing and structure. |
| Camera | Date/detail: 3.72:1 at 9 px; filmstrip label: 2.60:1 at 8 px | Make collection labels readable independently of the camera decoration. |
| Word of the Day | Tab label: 3.17:1; date: 2.69:1 at 11 px | Use darker text on coral or a darker background. |
| 404 | White/coral return action: 3.17:1 | Adjust the functional button text/background pair. |

WCAG's usual minimum is 4.5:1 for normal text and 3:1 for qualifying large text. The repeated automated warning about the “OT” logo is **not** counted here as a required text-contrast fix: logotypes have an explicit exception. [W3C contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

The Projects scan also flags a scrollable setup pane without a focus target, `aria-label` on a `pre` without an appropriate role, and skipped heading levels. Make any independently scrolling meaningful region keyboard reachable and properly named; label terminal output through suitable surrounding semantics. Review repeated back links outside landmarks and redundant camera-thumbnail alternative text as smaller cleanup items.

For touch ergonomics, enlarge compact navigation/action hit areas where possible. This is a usability recommendation: WCAG 2.2's 24 CSS px target rule includes spacing exceptions, so small text links are not automatically failures. [W3C target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

Evidence: [desktop accessibility results](../../output/playwright/website-audit/desktop-checks.json), [desktop Projects](../../output/playwright/website-audit/desktop-projects.png), [phone camera](../../output/playwright/website-audit/mobile-photos-camera.png).

### 08. Show a recoverable state when previews time out

**Observed:** Holding the `/blog` preview request pending in an isolated browser context leaves the dialog showing only a spinner after the 10-second timeout has elapsed. There is no error or retry message. The separate “View full page” link remains available.

**Cause:** [controller.ts](../../src/modal/controller.ts), lines 330–345, aborts the request on timeout, then returns immediately for every `AbortError`. Intentional cancellation and timeout use the same path. The spinner also has no loading status text.

**Fix:** Distinguish timeout from closing/replacing the dialog. On timeout, show a short message, retry action, and full-page link. Announce loading and failure with an appropriate status element. Retain request identity checks so an older response cannot overwrite a newer selection.

**Acceptance:** A pending request reaches a visible recoverable state; deliberate close stays closed; rapid section changes show only the latest result. Fresh Blog, Projects, Reading, Photos, and Word previews rendered successfully once loading settled.

Evidence: [timeout state](../../output/playwright/website-audit/modal-timeout.png).

### 09. Make the verification and preview workflow usable

All project checks were run using `devcontainer exec --workspace-folder .`.

| Command | Result |
| --- | --- |
| `pnpm lint` | Pass: 101 files checked |
| `pnpm check` | Pass: 92 files, zero errors/warnings, one deprecated-API hint in `public/admin/cover-suggest.js` |
| `pnpm test` | Fail, exit 1: “No test files found” |
| `pnpm build` | Pass, with the large scene-chunk warning |
| `pnpm preview --port 4321` | Starts, but GET `/`, `/blog`, and `/reading` return 404 after the successful build |

The `ci` script includes `pnpm test`, so it currently cannot complete successfully. No repository GitHub Actions workflow was found. The preview behavior is a **local workflow defect**, not a production outage: the live pages worked, and built homepage module hashes matched production.

**Recommendation:** Add a small set of behavioral regression checks around the failures in this report: fallback states, restored search/lightboxes, and modal cancellation/timeout. Make the existing `ci` command meaningful and connect it to the deployment/review workflow. Fix or document the production-preview command appropriate to the Vercel adapter output. Expand README with devcontainer commands, preview/deployment expectations, and CMS publishing basics.

The repository already has useful foundations: TypeScript, content schemas, linting, a lockfile, and pre-commit lint/type checks. The missing piece is executable confidence in the browser lifecycles.

Evidence: [package scripts](../../package.json), [preview responses](../../output/playwright/website-audit/preview-health.json).

### 10. Replace empty sharing assets and use collection covers

**Observed:** [og-default.png](../../public/og-default.png) is a uniform dark 1200 × 630 rectangle. [apple-touch-icon.png](../../public/apple-touch-icon.png) is also a uniform dark rectangle. The SVG favicon does contain the OT mark.

The generated pages point at the default social image, including the photography pages. [SEOHead.astro](../../src/components/SEOHead.astro), lines 16–19, has an image fallback; [photos/[slug].astro](../../src/pages/photos/[slug].astro), lines 19–23, does not pass its available collection cover into the layout.

**Recommendation:** Create one recognizable default sharing image with the name and a small desk/shelf or typographic composition, plus a legible home-screen icon. Pass each photo collection's cover through the layout. Consider title cards for blog posts later. Preserve the existing canonical, Open Graph, Twitter, sitemap, RSS, and structured-data plumbing, which is already present.

This was asset/metadata inspection; previews were not posted to social accounts to test individual platform caches.

### 11. Let the actual project lead the Projects page

The terminal/window-manager idea is distinctive, but the current project occupies a small block of text in a large pane while hardware, environment details, and simulated output occupy substantial attention. On the phone layout, the clock and setup information appear before the actual project. At narrow widths, the project's primary links are well down the page.

**Recommendation:** Keep the theme but increase the project title and description, explain what a visitor can try, and show a representative image or a short outcome. Place project actions before setup on mobile. Let setup be a secondary window, tab, or collapsible section. “Source” is clearer than “src” for visitors outside software development.

A personal project does not need a corporate case study. A few concrete lines explaining the interactive scene and what you built would communicate more than the technology list alone.

Evidence: [desktop](../../output/playwright/website-audit/desktop-projects.png), [mobile](../../output/playwright/website-audit/mobile-projects.png), [320 px view](../../output/playwright/website-audit/narrow-320-projects.png).

## Design and content review by area

| Area | Keep | Next refinement |
| --- | --- | --- |
| Homepage | Recognizable low-poly desk and shelf; playful physical objects | Add identity and navigation; distinguish content objects; make scrolling discoverable. |
| Blog list and posts | Warm paper, readable prose colors, restrained width, clear dates | Break very long paragraphs for phone reading while keeping the informal voice. Add a visible RSS link if repeat readership matters. |
| Reading | Book covers and shelf grouping feel personal; fresh-load search works | Fix restoration; allow longer titles/authors to be read without relying on truncated labels. |
| Projects | Terminal and phone concepts suit the author's interests | Give the project stronger hierarchy; improve small-text contrast; reduce setup dominance. |
| Photo index and collections | Corkboard/print presentation, large imagery, captions | Resize downloads; keep captions readable on touch; use covers in sharing metadata. |
| Camera variant | Strong visual object metaphor | Increase collection-label size and contrast; maintain an obvious path to the ordinary collection list. |
| Photo viewer | Desktop arrows, Escape, counter, touch swipe, focus restoration work on fresh visits | Repair Back restoration; retain discoverable previous/next controls on phones. |
| Word archive | Dictionary-like typography and personal quips | Improve date/tab contrast; make it reachable outside the scene. The newest entry is March 23, so “Latest word” or a clearly described archive avoids implying a daily update schedule. |
| 404 | Clear missing-page message and return action | Fix the return button contrast. |
| Shared navigation/footer | Repeated destinations, visible keyboard focus, GitHub/LinkedIn links | Make homepage access equally obvious; consider a direct contact path if that is an intended visitor action. |

The varied surfaces work best as different objects in the same room. Keep the shared typography, navigation, spacing, and focus behavior consistent while allowing the page surfaces to differ.

## Performance measurements and limits

Lighthouse 13.4.1, mobile emulation, simulated throttling, approximately 1.6 Mbps throughput and 4× CPU slowdown. These are single lab runs in headless Chrome in the devcontainer. The homepage used software WebGL; its CPU timing is especially sensitive to this environment.

| Page | Performance | Accessibility* | Best practices* | SEO* | LCP | Total blocking time | CLS | Transfer |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Homepage | 64 | 100 | 100 | 100 | 2.9 s | 7,490 ms | 0.000 | 359 KiB |
| Blog | 100 | 95 | 100 | 100 | 1.5 s | 0 ms | 0.022 | 156 KiB |
| Paris collection | 75 | 96 | 100 | 100 | 14.4 s | 0 ms | 0.000 | 9,235 KiB |

*Automated category scores are not accessibility conformance, security certification, or proof of good search visibility. The homepage scores 100 for automated accessibility despite the manually reproduced fallback and keyboard issues.

The scene chunk is approximately **614 KiB raw / 164 KiB gzip**. Optional PostHog adds a separate approximately 191 KiB raw chunk in the build, but that chunk was not observed loading on the tested live homepage and is not counted as default page transfer. The homepage also preloads three fonts; consider route-specific preloads after the larger issues are addressed.

The scene already has useful safeguards: lazy loading, idle frame limiting, reduced-motion checks, hidden-tab pausing, and resource disposal. Desktop idle floating still drives rendering. Profile startup and idle behavior on an actual midrange phone before deciding which effects or quality levels to change. Consider a still or lower-detail option, and keep a fast HTML route available while the scene loads.

The blog demonstrates that the basic static content stack can be fast. Image delivery is the clearest performance opportunity. Field Core Web Vitals were not available; laboratory total blocking time is not a measurement of real-user INP. [Core Web Vitals reference](https://web.dev/articles/vitals).

Reports: [homepage](../../output/playwright/website-audit/lighthouse-home-mobile.report.html), [blog](../../output/playwright/website-audit/lighthouse-blog-mobile.report.html), [Paris](../../output/playwright/website-audit/lighthouse-photos-mobile.report.html), [metrics/settings JSON](../../output/playwright/website-audit/lighthouse-summary.json).

## Code, publishing, search, and operational follow-up

These are source-backed recommendations, not additional claims of reproduced production failures.

| Area | Finding and focused next step |
| --- | --- |
| Lifecycle ownership | The code has useful DOM/modal/Three.js boundaries, but lifecycle ownership varies by feature. Fix that shared contract before extracting more abstractions. |
| Scene complexity | `unified-scene.ts` is about 1,600 lines; mobile scrolling, animation, and dragging also carry substantial state. After adding behavior coverage, separate desktop/shelf orchestration behind a small transition/lifecycle interface. File length alone is not a bug and does not justify a rewrite. |
| Preview coupling | [preview.ts](../../src/modal/preview.ts) fetches full pages, extracts content, and removes scripts/unsafe markup. Homepage imports section styles, which contain preview-specific overrides. This is manageable now, but each new interactive section must explicitly define its preview behavior. Prefer a clear static-preview contract or dedicated preview markup if the coupling grows. |
| URL/history model | Opening a section preview leaves the URL and title at the homepage; copying the address does not share the section. History state is saved when following a preview link, and return-to-preview worked in the Photos journey. Decide whether opening/closing previews should also participate in browser history, or make the direct section link more prominent. |
| Duplicate variants | `/projects` redirects narrow screens with JavaScript to `/projects/phone`; both use self-canonicals. `/photos` and `/photos/camera` also present the same collections with separate self-canonicals. Establish a preferred content URL and a deliberate policy for visual variants. This is an opportunity to consolidate signals, not evidence of a search penalty. |
| Metadata consistency | Photography page titles use `Collection | Photos` without the author's name. Descriptions, canonical URLs, Open Graph/Twitter fields, RSS, sitemap, and JSON-LD exist. Standardize branding and sharing images before adding more metadata. |
| CMS signing API | [cloudinary-sign.ts](../../src/pages/api/cloudinary-sign.ts) checks GitHub repository push permission before signing and keeps the API secret server-side. The body and `params_to_sign` are not runtime-schema validated; folder sanitation is the main parameter constraint. Add an explicit supported parameter contract, input limits, a timeout for the GitHub request, and controlled 400/5xx messages. Review deployment-level abuse limits if needed. No unauthorized signing or upload was attempted or established. |
| Admin checks | `public/admin/*.js` is outside Biome's configured source include patterns. Include these maintained scripts in an appropriate lint/check path. The current Astro hint concerns deprecated `document.execCommand("copy")`; modernize the clipboard path with a fallback when editing that feature. |
| Publishing dates | `getPublishedPosts()` filters drafts but does not exclude future `pubDate` values. Word entries are filtered at build time, so a scheduled entry will need a rebuild to appear. Document those semantics if scheduling is intended. `updatedDate` also accepts a string transformed to `Date` without validating the transformed date; harden the schema to reject malformed values. No currently published entry caused a build failure. |
| Analytics | Vercel Analytics and Speed Insights are present. PostHog is optional and disables autocapture in code. If analytics is used to guide changes, measure section opens and successful content visits deliberately; homepage-only page views cannot fully describe in-place browsing. Do not assume dashboard settings or retention from client code. |
| Developer documentation | README describes the concept and stack, but lacks a start/check/preview/deploy guide. Document the canonical devcontainer workflow, required CMS environment variables, content relationships, and publishing/rebuild expectations. |

The live response checks confirmed CSP, anti-framing headers, `nosniff`, HSTS, referrer policy, and restricted camera/microphone/geolocation permissions. Hashed assets have long-lived immutable caching. The admin entry is version-pinned and marked noindex. The public CSP still allows inline scripts; tightening this is a separate improvement that must account for Astro's inline output. These controls are useful foundations, not a substitute for input validation or dependency updates.

## What was verified

- All 12 public content routes, including both blog posts, both Projects variants, both photo index variants, both collections, Reading, Word of the Day, and the homepage; also the 404 page.
- Desktop screenshots at 1440 × 900 and touch-enabled phone emulation around 390 px wide. Additional 320 px and 768 px checks on representative layouts found no horizontal overflow in the tested routes.
- Fresh-load reading filtering/empty-state behavior, desktop photo opening/arrow navigation/Escape/focus return, mobile photo opening/swipe/close/focus return, homepage shelf scrolling, section previews, and the keyboard skip link.
- Back/forward cache behavior, reduced motion, JavaScript disabled, unavailable WebGL, and a stalled preview request.
- Generated route metadata and local-link targets; no broken local targets were found in the generated HTML sweep. All 23 inspected external image URLs returned 200. This was not an exhaustive check of every outbound social/book link.
- axe scans on desktop and mobile, selected Lighthouse runs, production response headers, dependency advisories, lint, Astro check, tests, and build.

Not covered: authenticated CMS editing/uploads, real Safari/Firefox behavior, human screen-reader use, real-device GPU/battery profiling, field analytics, social platform cache rendering, hosting dashboard settings, or penetration testing. Mobile emulation does not substitute for a physical iPhone. The local preview defect limited server-preview testing; browser journeys were tested against production, with matching built homepage module hashes.

Raw evidence and screenshots are in [output/playwright/website-audit](../../output/playwright/website-audit). The scans include automated warnings that this report deliberately qualifies or excludes, such as logo contrast.

## Suggested implementation order

1. Repair fallback state and cached-page restoration, with small browser regression checks.
2. Add responsive photo delivery and repeat the Paris performance check.
3. Triage/update dependencies and restore a working test/preview workflow.
4. Add homepage orientation, strengthen keyboard semantics, and correct meaningful-text contrast.
5. Improve timeout recovery, replace empty sharing assets, and strengthen Projects hierarchy.
6. Address the smaller URL, publishing, admin-validation, and architecture follow-ups as focused changes.
