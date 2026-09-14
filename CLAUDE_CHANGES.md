# Claude Changes

Persistent engineering handoff for Claude's work on Kiln. This file is intentionally separate from `CHATGPT_CHANGES.md` so one agent cannot overwrite another agent's history.

## 2026-09-14 — Real sandbox/runtime work

- Built the sandboxed execution path for real Ember-generated JavaScript.
- Added the real code-generation path for Ember Runner.
- Added asset bridging so uploaded image assets can be accessed by generated code through `Kiln.assets["asset-name"]`.
- Added real parent-to-iframe pause/resume messaging; pausing now stops the game's frame callback rather than merely dimming the preview.
- Added `@` asset-reference autocomplete to the Ember prompt, including keyboard navigation and exact asset-name insertion.
- Fixed the preview drawing scale for high-DPI displays by applying the device-pixel-ratio transform to the canvas context.
- Fixed the global keyboard handling so the chat input can receive normal typing such as the spacebar.

## 2026-09-12 — Ember Runner migration

- Migrated Ember Runner from the fixed game-definition path to a genuine playable `game.js`.
- Implemented real gravity, platform collision, enemy behavior, collectibles, scoring, and a finish condition using the sandbox API.
- Verified the finish/win path, enemy/lose path, collectible scoring, fall/lose path, syntax, and production build.

## Engineering notes

- The sandbox is an isolation boundary. Generated project code must not execute on the API server.
- Preserve the real sandbox contract when evolving Ember into a multi-file coding agent.
- Keep responsive canvas behavior correct on high-DPI and mobile displays.
- Claude's original commits remain in Git history and should be treated as the authoritative record for exact historical diffs.

## Current handoff

ChatGPT is continuing the migration toward a real project-level Ember coding agent. The new `/api/assistant/project` contract supports multi-file create/update/delete/rename operations with validation. The remaining work is client integration, atomic project-state application, and a genuine multi-file preview runtime.

### Historical Claude commits

- `b0cd9a1` — real pause/resume follow-up
- `d84d15e` — real sandbox pause/resume implementation
- `1c074c4` — `@` asset mention autocomplete
- `ccaa622` — high-DPI canvas scaling fix
- `da758ba` — real Ember Runner `game.js`
- `fb88f3c` — Ember Runner rearchitecture notes
