# Audit coverage inventory

Target: production website and local production build at commit 50a42489048bd73f6f9080e7c5d639c0103e3444.

- Desktop and mobile homepage: first impression, object discovery, section opening, decor, shelf scrolling, viewport fit.
- Keyboard: skip link, text navigation, scene object focus and activation, modal focus trap, Escape and focus restoration.
- Section pages: blog, both articles, projects desktop/phone, reading, photos/camera, both photo collections, word archive, 404.
- Reading search: matching, no results, clearing, browser Back restoration.
- Photo viewer: opening, next/previous, keyboard, close, focus restoration and image fit.
- Preview modals: content, full page links, close, Back, failure/timeout behavior.
- Resilience: JavaScript disabled, WebGL unavailable, reduced motion, narrow viewport, blocked network request.
- Health: lint, Astro check, tests, build, dependencies, route status, internal links, metadata, responsive images and transfer sizes.
- Visual review: screenshots of desktop/mobile initial states and relevant interaction/failure states.

Excluded: authenticated CMS writes/uploads, destructive security tests, real device GPU/battery measurement, field analytics, human screen-reader testing.
