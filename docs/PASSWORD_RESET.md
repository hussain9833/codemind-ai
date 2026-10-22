# Forgot password: email one-time code (OTP)

## For users
1. **/forgot-password** → enter your account email → **Send code**.
2. A 6-digit code arrives by email (valid **10 minutes**, works **once**).
3. Enter the code, choose a new password (10+ characters), confirm → **Reset password**.
4. You are signed out of every device and sent to the login page.

The page always says "if an account exists we emailed a code", so registered emails cannot be discovered.

## Setup (Gmail App Password)
1. Google Account → Security → turn on **2-Step Verification**.
2. Open https://myaccount.google.com/apppasswords → create an app password (16 characters).
3. Fill these in `.env.local`, then restart the server:
   ```
   SMTP_HOST="smtp.gmail.com"
   SMTP_PORT="465"
   SMTP_USER="you@gmail.com"
   SMTP_PASS="abcd efgh ijkl mnop"     # the app password (spaces are ignored)
   MAIL_FROM=""                        # optional, e.g. "CodeMind AI <you@gmail.com>"
   ```
Any SMTP provider works (use port 587 for STARTTLS). With the SMTP settings blank, local development prints the
code in the server console; in production the page reports that email is not set up.

## Security
- Codes are 6 random digits (CSPRNG); only an HMAC bound to the user is stored, never the code.
- Single use, 10-minute expiry, **5 wrong guesses burn the code**, a new code replaces the old one.
- Resend cooldown 60 s; limits: 5 sends per email and 15 per IP, 10 verifications per email and 30 per IP, per 15 min
  (in-memory per server instance, so use Redis/DB before a wide public launch).
- Success signs out all sessions. Generic responses for unknown emails. SMTP credentials stay server-side and are never logged
  (only the SMTP error code, e.g. `EAUTH` = wrong app password).

## Code map
`src/app/(auth)/actions.ts` (`requestResetOtpAction`, `resetWithOtpAction`) · `src/lib/otp.ts` · `src/lib/mail.ts` ·
`src/components/features/forgot-form.tsx` · Prisma `PasswordResetOtp`.
