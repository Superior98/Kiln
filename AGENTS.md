# Kiln AI Agent Handoff

Before modifying Kiln, read:

1. `CHATGPT_CHANGES.md` — ChatGPT's engineering handoff and migration notes.
2. `AI_CHANGES.json` — machine-readable change history.
3. Existing source code — repository state always wins over historical notes.

## Rules

- Preserve real implementations; do not turn features into mocks or placeholders.
- Keep generated project code isolated from the Kiln host application.
- Treat LLM-generated file operations as untrusted input and validate them before applying.
- Never execute generated game code on the API server.
- Keep project paths relative and traversal-safe.
- Apply coherent multi-file changes atomically from the user's perspective.
- Preserve responsive viewport behavior on desktop, tablet and mobile.
- When completing a meaningful milestone, add an entry to `CHATGPT_CHANGES.md` or the corresponding agent handoff and `AI_CHANGES.json`.
- If another agent's handoff exists, do not overwrite it; append or create an agent-specific section.

## Current architecture direction

Kiln is moving from a single-file Ember code generator toward a real project coding agent:

`prompt → inspect project → plan operations → validate → atomically apply → persist → run isolated preview → record changes`

The multi-file API foundation is `/api/assistant/project` in `artifacts/api-server/src/routes/project-agent.ts`.
