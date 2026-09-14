# ChatGPT Changes

Persistent handoff notes for AI-assisted work on Kiln.

## 2026-09-14 — Responsive foundation

- Hardened `artifacts/kiln-app/index.html` for responsive viewport sizing.
- Added `viewport-fit=cover` and mobile theme metadata.
- Added root-level `html`, `body`, and `#root` sizing using the available viewport.
- Added `100dvh` support where available.
- Prevented page overflow and mobile overscroll from breaking the app shell.
- Added global `box-sizing: border-box` for consistent panel/control sizing.
- Added width constraints for controls on narrow screens.
- Updated the page description to identify Kiln as an AI-powered game creation environment.

## 2026-09-14 — Bramble Maze

- Continued the real playable Bramble Maze implementation.
- Target runtime includes generated maze layout, wall collision, reachable goal selection, enemy movement, collectibles, scoring, torch visibility, and win/lose states.
- The game is intended to run through Kiln's real sandbox rather than a static mock.

## 2026-09-14 — Ember code generation

- Ember code mode is model-backed and produces runnable JavaScript.
- Ember receives current project code and asset names.
- Generated code is syntax-validated before application.
- Uploaded image assets can be exposed through `Kiln.assets[...]`.
- Preview execution uses the real sandbox.

## Next milestone — multi-file coding agent

1. Read the project file map and relevant contents.
2. Plan changes across multiple files.
3. Create, update, rename, and delete files safely.
4. Validate affected files.
5. Apply changes atomically.
6. Run the resulting project in preview.
7. Record every operation in this handoff log.

## Handoff

Repository files remain the source of truth. Preserve working systems and avoid replacing real implementations with placeholders. Keep project paths sandbox-safe and prevent traversal or absolute paths. Preserve the responsive viewport work when modifying the app shell.
