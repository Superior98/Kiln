# ChatGPT Changes

Persistent engineering handoff for Kiln. **Agents returning to this repository should read this file before making architectural changes.** The repository and its current source code are the source of truth; this file records intent, important decisions, and work completed by ChatGPT.

## 2026-09-14 — Responsive foundation

- Hardened `artifacts/kiln-app/index.html` for responsive viewport sizing.
- Added `viewport-fit=cover` and mobile theme metadata.
- Added root-level `html`, `body`, and `#root` sizing against the available viewport.
- Added `100dvh` support where available.
- Prevented page overflow and mobile overscroll from breaking the app shell.
- Added global `box-sizing: border-box` for predictable panel/control sizing.
- Added width constraints for controls on narrow screens.
- Updated the page description to identify Kiln as an AI-powered game creation environment.

## 2026-09-14 — Bramble Maze

- Continued the real playable Bramble Maze implementation.
- Target runtime includes generated maze layout, wall collision, reachable goal selection, enemy movement, collectibles, scoring, torch visibility, and win/lose states.
- The game is intended to run through Kiln's real sandbox rather than a static mock.

## 2026-09-14 — Ember runtime and assets

- Ember code mode is model-backed and produces runnable JavaScript.
- Ember receives current project code and asset names.
- Uploaded image assets can be exposed through `Kiln.assets["asset-name"]`.
- Preview execution uses the isolated sandbox in `artifacts/kiln-app/src/components/code-sandbox.tsx`.
- The sandbox uses `sandbox="allow-scripts"`, no `allow-same-origin`, a restrictive CSP, and a narrow `Kiln` API.
- Pause/resume is implemented through the sandbox message protocol.

## 2026-09-14 — Multi-file Ember agent integration

The project-level agent is now wired into the real Ember code-mode request path without deleting the older schema-mode path.

### Server

- `artifacts/api-server/src/routes/project-agent.ts` exposes `/api/assistant/project`.
- The endpoint receives the bounded project file map and assets, asks Ember for structured create/update/delete/rename operations, validates the full batch, and returns the operations atomically.
- Generated project code is never executed on the API server.
- JavaScript module syntax is intentionally accepted by the API; parsing/execution belongs to the isolated browser runtime.

### Client

- `artifacts/kiln-app/src/lib/project-agent.ts` owns the typed operation contract and atomic application helper.
- `artifacts/kiln-app/src/lib/project-agent-bridge.ts` intercepts Ember's existing `responseFormat: "code"` request, supplies the complete current project files to the project agent, applies the returned operation batch to the real `kiln-project-files-v1` project store, and adapts the result back to the existing Ember UI contract.
- Create/delete/rename operations are persisted first and trigger a clean reload so the current React file state picks up structural changes safely.
- Pure updates remain in-place.
- Source `game.js` is preserved separately so the compatibility runtime can be rebuilt without feeding its generated loader back to Ember as source code.
- `main.tsx` installs the bridge at application startup.

### Multi-file runtime

- Added `artifacts/kiln-app/src/components/project-code-sandbox.tsx`, an isolated multi-file ES-module sandbox implementation with relative-import resolution, asset bridging, pause/resume, and runtime error reporting.
- Added a compatibility bundling layer to the active bridge so the existing `CodeSandbox` can execute projects whose `game.js` imports project-local modules without exposing the parent app or network to generated code.
- Relative `.js` / `.mjs` project imports are resolved; bare/external imports remain blocked by design.
- The generated runtime is still executed only inside the sandbox. The API server never executes generated code.

### Persistent change history

- `artifacts/kiln-app/src/lib/project-history.ts` records agent, project, timestamp, summary, and per-file actions in `kiln-agent-changes-v1`.
- `artifacts/kiln-app/src/lib/changes-dock.ts` adds a persistent in-app **Changes** dock with All / Ember / ChatGPT / Claude filters.
- Claude's repository history remains separately documented in `CLAUDE_CHANGES.md`; it is not overwritten by the ChatGPT history.

## 2026-09-14 — Current state

The main migration path is now implemented: Ember can operate on a real multi-file project, the operation batch is atomic, structural changes persist, the change history is visible, and project-local modules can be compiled into the existing isolated preview boundary.

Known intentional limitations:

- The compatibility runtime supports project-local JavaScript modules, not arbitrary npm/browser package imports.
- The active app preview still uses the established `CodeSandbox` component; the standalone `project-code-sandbox.tsx` is available as the cleaner native runtime for the next UI cleanup pass.
- 3D projects continue through their existing Three.js preview path rather than the 2D module sandbox.
- Automated browser-level regression tests should still be added before treating this as a locked production milestone.

## Engineering rules for future agents

1. Treat repository files as the source of truth.
2. Preserve working systems; do not replace real implementations with mock/demo behavior.
3. Keep generated project paths sandbox-safe.
4. Never execute LLM-generated project code on the API server.
5. Keep generated game code inside the isolated preview boundary.
6. Validate before applying multi-file operations.
7. Prefer atomic application of a coherent agent response.
8. Keep responsive behavior intact across desktop, tablet, and mobile.
9. Record meaningful changes here after completing a milestone.
10. When replacing an architectural subsystem, leave a clear migration note and remove dead code only after the replacement is proven.

## Remaining priority order

1. Add automated validation for project-agent responses and sandbox regressions.
2. Finish and test Bramble Maze end-to-end in the real preview.
3. Replace the temporary compatibility bridge with the native multi-file sandbox once browser testing proves it safe and stable.
