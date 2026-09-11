---
name: Groq assistant compatibility
description: Non-obvious Groq model access and response-shape behavior for the Kiln assistant.
---

Discover the chat model catalog for each Groq key instead of assuming a fixed model is available. Some accessible reasoning models may put the usable text in `message.reasoning` rather than `message.content`, especially when the token budget is too small for both reasoning and a final answer.

**Why:** The imported Cloudflare worker returned 500 because its secret was missing, and the replacement Groq key exposed a different model catalog and response shape than the original integration assumed.

**How to apply:** Keep provider keys server-side, choose from the key's `/models` response, allow enough completion tokens for reasoning models, and normalize `content`, array content parts, `reasoning_content`, and `reasoning`.