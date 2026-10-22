# Password reset (short guide)

Two ways to reset a forgotten password. Neither uses OTP codes.

## 1. Email link (default)
1. User opens **/forgot-password** → tab **Email me a link** → enters their email.
2. If the account exists, a one-time link is emailed (`/reset-password?token=…`). The screen always says
   *"If an account exists, we sent a link"*, so registered emails cannot be discovered.
3. The link works **once** and expires after **30 minutes**. Asking again cancels the older link.
4. User chooses a new password (10+ characters). All devices are signed out.

Stored in the database: only a SHA-256 hash of the token (table `PasswordResetToken`).

## 2. Recovery code (works without email)
- A code like `XXXXX-XXXXX-XXXXX-XXXXX` (100 bits) is shown **once** at signup, with Copy / Download.
- Reset at **/forgot-password** → tab **Recovery code** → email + code + new password.
- Each code works once; a new one is shown after every reset. Only an HMAC of the code is stored.
- Existing users create or replace a code in **Settings → Security** (password required).

## If both are lost
Owner-only fallback on the server: `npm run admin:reset-password -- user@example.com`
(asks for the new password, signs the account out everywhere, prints a new recovery code).

## Setup (email)
Add to `.env.local`, then restart:
```
RESEND_API_KEY="re_..."
MAIL_FROM="CodeMind <no-reply@your-verified-domain.com>"
APP_URL="https://your-app-domain"      # used to build the link
```
- Resend **test mode** (`onboarding@resend.dev`) only delivers to the Resend account owner's own address.
  To email other users, verify a domain at resend.com/domains and use it in `MAIL_FROM`.
- Without these settings: local dev prints the link in the server console; production hides the email tab.

## Security summary
- Same response for known/unknown emails; constant-time code comparison.
- Rate limits: link requests 3/email + 10/IP per 15 min; code attempts 5/email + 20/IP per 15 min
  (in-memory per server instance — use a shared store such as Redis before a public launch).
- Tokens/codes are single-use; successful reset revokes every session.

## Code map
`src/app/(auth)/actions.ts` (actions) · `src/lib/reset-token.ts` · `src/lib/recovery.ts` · `src/lib/mail.ts` ·
`src/components/features/forgot-form.tsx`, `reset-password-form.tsx`, `recovery-code-panel.tsx`, `recovery-card.tsx` ·
`scripts/admin-reset-password.mjs`
