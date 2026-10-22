# CodeMind AI

Evidence-driven AI engineering platform. Problem → Evidence → Hypotheses → Investigation → Root Cause → Fix → Tests → Validation → Review → Human Approval → Pull Request.

Status: Phase 1 (UI) and Phase 2 (auth, database, GitHub) are implemented. Repository indexing and AI are not.

## Setup

```bash
npm install
cp .env.example .env.local     # fill in Neon + GitHub App values (see docs/GITHUB_APP.md)
npm run db:migrate             # applies prisma/migrations to DIRECT_URL (enables pgvector)
npm run dev
```

Neon: use the **pooled** connection string for `DATABASE_URL` and the **direct** one for `DIRECT_URL`.

## Security model

- All secrets are server-side env vars (no `NEXT_PUBLIC_*`); `src/lib/env.ts` is `server-only` and validates them.
- Passwords: scrypt. Sessions: random token in an HttpOnly cookie; only its SHA-256 is stored.
- GitHub tokens: AES-256-GCM encrypted at rest.
- `src/proxy.ts` only redirects cookie-less visitors; real auth is enforced in server layouts/pages/actions (`requireUser`) and project ownership in `requireProject` / user-scoped queries in `src/lib/api.ts`.
- Forgotten passwords are reset with a 6-digit one-time code emailed over SMTP (Gmail App Password supported): 10-minute expiry, single use, 5 guesses, HMAC-stored, all sessions revoked on success. See `docs/PASSWORD_RESET.md`.
- Not implemented yet: login rate limiting, email verification. Request/reset limiting is in-memory per server instance; use a shared store (Redis/DB) before wide public use.
