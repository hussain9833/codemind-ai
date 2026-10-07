# GitHub App setup & permissions

CodeMind connects to GitHub through a **GitHub App** (not an OAuth App, not a personal token).
Users pick which repositories to share; CodeMind never sees the rest.

## 1. Create the app

GitHub → Settings → Developer settings → GitHub Apps → **New GitHub App**.

| Field | Value |
|---|---|
| Homepage URL | your `APP_URL` |
| Callback URL | `${APP_URL}/api/github/callback` |
| Setup URL | `${APP_URL}/api/github/callback` (tick *Redirect on update*) |
| Request user authorization (OAuth) during installation | **off** (CodeMind runs its own connect step) |
| Expire user authorization tokens | **on** (CodeMind refreshes them) |
| Webhook | **inactive** for now (activate in a later phase) |
| Where can this app be installed | Any account (or only yours while developing) |

Then: generate a **client secret** and a **private key** (.pem), and note the **App ID**, **Client ID** and the app **slug** (the last part of `github.com/apps/<slug>`).

Put them in `.env.local` (see `.env.example`). The `.pem` goes in `GITHUB_APP_PRIVATE_KEY` with newlines written as `\n`.

## 2. Permissions (minimum required)

| Permission | Level | Why |
|---|---|---|
| **Metadata** | Read | Mandatory for all apps; repository names, default branch, visibility, language, branch list. |
| **Contents** | Read | Phase 3: read files to index/investigate the repository. Not used for writing. |

Deliberately **not** requested now:

| Permission | Needed later for | When |
|---|---|---|
| Pull requests: Read & write | Opening the human-approved fix pull request | Request only when the PR phase ships (GitHub will ask installers to approve the change). |
| Contents: Write | Pushing the fix branch | Same phase as above. |
| Checks / Actions | Reporting validation results | Only if CI integration is added. |

No account (user) permissions are requested. The user-to-server token is used only to prove which
installations/repositories *that user* may access.

## 3. How access is enforced

1. User clicks **Connect GitHub** → GitHub authorization with a random `state` (HttpOnly cookie, 10 min, compared in constant time).
2. The returned token is stored **encrypted (AES-256-GCM)**; the key lives only in `ENCRYPTION_KEY`.
3. Installations and repositories are listed with the **user's** token, so a user sees only repositories where the app is installed **and** they personally have access.
4. On project creation the server re-verifies installation → repository → branch against GitHub; it ignores any metadata sent by the browser.
5. Every later project request is checked against `project.userId` on the server (`src/lib/authz.ts`).
6. The app private key is used only server-side to mint short-lived installation tokens (`installationToken()`), never sent to the browser or logged.
