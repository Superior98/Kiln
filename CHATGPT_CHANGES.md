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
- Generated JavaScript is syntax-validated before application.
- Uploaded image assets can be exposed through `Kiln.assets["asset-name"]`.
- Preview execution uses the isolated sandbox in `artifacts/kiln-app/src/components/code-sandbox.tsx`.
- The sandbox uses `sandbox="allow-scripts"`, no `allow-same-origin`, a restrictive CSP, and a narrow `Kiln` API.
- Pause/resume is implemented through the sandbox message protocol.

## 2026-09-14 — Multi-file Ember agent integration

The project-level agent foundation is now wired into the real Ember code-mode request path without deleting the older schema-mode path.

### Server

- `artifacts/api-server/src/routes/project-agent.ts` exposes `/api/assistant/project`.
- The endpoint receives the bounded project file map and assets, asks Ember for structured create/update/delete/rename operations, validates the full batch, and returns the operations atomically.
- Generated project code is never executed on the API server.

### Client

- `artifacts/kiln-app/src/lib/project-agent.ts` owns the typed operation contract and atomic application helper.
- `artifacts/kiln-app/src/lib/project-agent-bridge.ts` intercepts Ember's existing `responseFormat: "code"` request, supplies the complete current project files to the project agent, applies the returned operation batch to the real `kiln-project-files-v1` project store, and adapts the result back to the existing Ember UI contract.
- Existing create/delete/rename operations are persisted first and trigger a clean reload so the current React file state picks up structural changes safely.
- Pure file updates remain in-place.
- `artifacts/kiln-app/src/main.tsx` installs the bridge at application startup.

### Persistent change history

- `artifacts/kiln-app/src/lib/project-history.ts` records agent, project, timestamp, summary, and per-file actions in `kiln-agent-changes-v1`.
- `artifacts/kiln-app/src/lib/changes-dock.ts` adds a persistent in-app **Changes** dock with All / Ember / ChatGPT / Claude filters.
- Claude's repository history remains separately documented in `CLAUDE_CHANGES.md`; it is not overwritten by the ChatGPT history.

### Important runtime boundary

The current preview remains the existing isolated single-entry `game.js` sandbox. The multi-file agent can now genuinely inspect and modify multiple stored project files, but the preview bundling layer still needs to be upgraded so arbitrary module imports between those files execute directly. Do not claim that arbitrary multi-module browser execution is finished until that runtime work is implemented and tested.

## 2026-09-14 — Agent handoff/change history

Kiln now has separate persistent histories for ChatGPT and Claude. Claude's dedicated record is `CLAUDE_CHANGES.md`; ChatGPT's record is this file. The Claude record was reconstructed from the existing Claude-authored Git commits so the historical work remains discoverable without mixing agent ownership.

Every future agent change should record:

- date;
- agent name;
- files changed;
- user-visible feature/fix;
- important architectural decisions;
- validation/testing performed;
- known follow-up work.

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

1. Upgrade preview execution so arbitrary multi-file project modules can actually run inside the isolated sandbox.
2. Finish and test Bramble Maze end-to-end in the real preview.
3. Add automated validation for project-agent responses and sandbox regressions.
4. Replace the temporary compatibility bridge with a native multi-file request/apply path once the runtime and UI are proven.
