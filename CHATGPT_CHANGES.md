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

**Do not remove this viewport foundation when changing the shell.** Desktop, tablet, and mobile must remain first-class targets.

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

## 2026-09-14 — Multi-file Ember agent foundation

Added `artifacts/api-server/src/routes/project-agent.ts` and registered it from `routes/index.ts`.

The new `/api/assistant/project` endpoint is a real project-level coding-agent contract. It can:

- inspect a bounded project file map;
- reason about changes across multiple files;
- create files;
- update complete files;
- delete files;
- rename files;
- validate JavaScript syntax without executing generated code;
- validate JSON files;
- reject absolute paths and traversal attempts;
- enforce file/count/project-size limits;
- return a structured operation list suitable for atomic client-side application.

This is intentionally separate from the legacy one-file `/api/assistant` code mode so existing projects do not break while the client migrates to the project-agent contract.

### Migration still required

The next client integration must wire the project agent into the main Ember send/apply path. Do **not** replace the existing one-file mode blindly. The intended flow is:

`user prompt → collect project files/assets → /api/assistant/project → validate operations → apply all operations atomically → persist project state → run preview → record changes`

The preview layer must then evolve from the current single-inline-script assumption toward a validated multi-file runtime/bundling strategy.

## 2026-09-14 — Agent handoff/change history

Kiln should maintain persistent change history for each coding agent. ChatGPT's history lives here. Claude's history should remain separately identifiable rather than overwriting this record.

Every future agent change should record:

- date;
- agent name;
- files changed;
- user-visible feature/fix;
- important architectural decisions;
- validation/testing performed;
- known follow-up work.

The goal is that Claude, ChatGPT, or another coding agent can return later and understand **what changed and why**, rather than reconstructing the project from conversation history.

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

## Current priority order

1. Integrate `/api/assistant/project` into Ember's real UI request/apply flow.
2. Add atomic multi-file project application and persistence.
3. Upgrade preview execution so a multi-file project can actually run, not merely be stored.
4. Add a visible Changes/Handoff section to the Kiln UI showing agent activity.
5. Finish and test Bramble Maze end-to-end in the real preview.
6. Add automated validation for project-agent responses and sandbox regressions.
