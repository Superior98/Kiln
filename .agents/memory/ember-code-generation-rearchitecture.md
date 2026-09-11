---
name: Ember code-generation rearchitecture
description: Multi-phase plan to let Ember write real game code instead of filling a fixed JSON schema, and the sandboxing approach that phase depends on.
---

Ember currently only fills in a fixed `game.json` shape (title, kind, background,
accent, instructions, player, platforms, enemies, collectibles, finish) via one
Groq completion, rendered by a hardcoded canvas renderer in `Preview2D`/`Preview3D`
(`KilnApp.jsx`). This means Ember can only ever build mechanics the schema already
anticipates — every new concept (a win popup, dialogue, inventory, etc.) requires a
human to add a schema field and teach the renderer to draw it. It cannot generalize.

**Goal:** Ember should write and edit real source files for a game's logic, the way
Replit's own Agent writes real code, so it isn't limited to a fixed vocabulary of
game-object types.

**Why this needs staging, not one pass:** running LLM-generated code in the browser
is a real security surface (untrusted code, potential for bugs/hangs, no ability to
review before it runs), and the backend response format, file-write model, and
existing demo projects (Ember Runner, Skyward Drift, Bramble Maze) all depend on the
current schema-based approach. Changing all of that at once with no way to run the
app and see it work would be high-risk.

**Planned phases:**
1. **Sandboxed execution harness** (done — see `code-sandbox.tsx`). A standalone
   component that runs arbitrary JS safely in a `sandbox="allow-scripts"` iframe
   (deliberately no `allow-same-origin`) with a strict CSP (`connect-src 'none'`,
   etc.) and a narrow `postMessage` protocol (`kiln:ready`, `kiln:error`,
   `kiln:win`, `kiln:lose`, `kiln:score`, `kiln:log`). Not wired into the live
   preview yet — verified in isolation (typecheck, bundle, and a functional test of
   the inline harness script covering the happy path, thrown errors, a hung/never-
   ready case, a per-frame error, and the win/lose double-fire guard).
2. **Backend response format** (done — see `routes/assistant.ts`). A new opt-in
   `responseFormat: "code"` on `POST /assistant` (mode `"build"`) has Ember return
   `{ summary, files: [{ path: "game.js", content }] }` instead of the fixed
   `game.json` shape, targeting the `Kiln` global from `code-sandbox.tsx`. Fully
   additive — omit `responseFormat` (or send `"schema"`) and behavior is byte-for-
   byte the same as before `normalizeGameSpec`/`parseBuildReply`. `parseCodeBuildReply`
   validates before anything reaches the client: JSON well-formed, bare `*.js`
   filename only (no directory traversal/nesting), one file (matches the harness's
   single inline script), 50k char cap, and a parse-only syntax check via
   `new Function()` (never invoked) so a bad generation comes back as a clean error
   instead of code that only fails once it's already in the browser. Verified with a
   functional test suite (happy path + every rejection case) run against the real
   module via temporary test-only exports (not committed) — I have no way to call
   the real Groq API from outside Replit, so actual generation *quality* with this
   new prompt is still unverified and should be the first thing tested live.
3. **Wire the sandbox into `PreviewPane`** behind a per-project mode, so schema-based
   projects keep working exactly as they do today while new projects (or ones
   explicitly migrated) run through the code path instead. This is also where the
   client's per-project file whitelist (`PROJECT_FILES` in `KilnApp.jsx`) needs a
   `game.js` entry added for any project that opts into code mode, and where
   `runAssistantResponse` needs to send `responseFormat: "code"` / `currentCode` and
   handle the response shape from phase 2 instead of assuming `data.game` always
   exists.
4. **Migrate or dual-support** the three existing demo projects.

**How to apply:** Don't skip straight to phase 2/3 without the harness from phase 1
in place and tested — it's the isolation boundary everything else assumes exists.
When wiring the sandbox into `PreviewPane`, reuse the existing "real build error" UI
pattern (see `UnavailablePreview`) for `kiln:error` messages rather than inventing a
new error surface.
