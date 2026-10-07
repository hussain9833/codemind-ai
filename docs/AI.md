# AI architecture (Phase 4)

```
User question / problem
        │
        ▼
 Query understanding (deterministic)      src/lib/repo/query.ts
        │
        ├─ exact text · symbols · files · dependencies · git   src/lib/repo/{search,evidence}.ts
        └─ vector search (pgvector, halfvec HNSW)               src/lib/ai/vector.ts
        │
        ▼
 Reciprocal-rank fusion → small cited context (≤ ~22k chars)   src/lib/ai/retrieval.ts
        │  secrets redacted (src/lib/ai/redact.ts)
        ▼
 AIProvider ── NVIDIAProvider (NIM)                             src/lib/ai/{types,nvidia}.ts
        │
        ▼
 Validation: JSON schema, citations must exist, file paths must be in the index
```

## Provider abstraction
`AIProvider` (`chat`, `embed`, `embeddingInfo`) is the only thing the rest of the app imports;
`getAIProvider()` returns `NVIDIAProvider`. `trackedProvider()` wraps any provider with rate
limiting and an `AIExecution` audit row (purpose, model, status, tokens, latency, error code — never prompts).

## NVIDIA NIM behaviour (observed on this account)
- Chat is **streamed**. A model that emits nothing for 25 s is treated as *stalled* and skipped
  (circuit-breaker for 5 min); a model that is streaming may take up to 150 s.
- `google/gemma-4-31b-it` is the configured primary but stalled on every call during testing, so
  requests fail over to `NVIDIA_CHAT_FALLBACK_MODELS` (default `nvidia/nemotron-3-super-120b-a12b`,
  `meta/llama-3.2-11b-vision-instruct`). If your key serves Gemma reliably, nothing needs to change;
  otherwise set `NVIDIA_CHAT_MODEL` to a working model to avoid the 25 s wait on cold starts.
- Listed models are not always invocable ("Function … not found for account", HTTP 410 end-of-life). Probe before choosing.
- Reasoning models spend completion tokens on hidden thinking, so the provider raises their `max_tokens`.

## Embeddings and pgvector
- Model: `nvidia/nemotron-3-embed-1b`. The **dimension (2048) is read from the model response**, not configured.
- `CodeChunk.embedding` is an unconstrained `vector`; each row records `embeddingModel` + `embeddingDim`.
- pgvector indexes `vector` only up to 2000 dimensions, so for larger models an **expression HNSW index on
  `embedding::halfvec(N)`** is created at runtime (`ensureVectorIndex`). Changing the model re-embeds only stale chunks.
- Queries use `input_type: "query"`, documents `"passage"` (asymmetric model).

## Safety rules enforced in code (not just in the prompt)
| Rule | Where |
|---|---|
| No evidence → no model call; answer is "There isn't enough evidence…" | `chat.ts`, `investigate.ts` |
| Unknown `[E#]` citations are stripped; an answer with no valid citation is downgraded to *insufficient* | `chat.ts` |
| File paths in an answer that are not in the index are removed | `chat.ts` |
| Hypothesis confidence is capped by evidence (`capConfidence`) | `investigate.ts` |
| "SUPPORTED" without a valid citation becomes INCONCLUSIVE | `investigate.ts` |
| Root-cause files must exist in the index | `investigate.ts` |
| Repository text is data: tag-escaped, wrapped in `<evidence>`, secrets redacted | `prompts.ts`, `redact.ts` |
| Timeline events are written when steps happen, never back-filled | `investigate.ts` |
