import "server-only";
import { Octokit } from "octokit";
import { decrypt, encrypt } from "./crypto";
import { db } from "./db";
import { env } from "./env";

/**
 * GitHub App integration.
 *
 * - User-to-server OAuth identifies the GitHub account and (via GET /user/installations)
 *   proves which installations the *user* may use. Tokens are encrypted at rest.
 * - Repository lists use the user's token, so a user only ever sees repositories that
 *   BOTH the app is installed on AND they personally can access.
 * - Installation (server-to-server) tokens are created on demand with the app private key
 *   for later phases (cloning/indexing, PRs). The private key never leaves the server.
 */

const GITHUB = "https://github.com";

export interface GhInstallation { id: number; account: string; avatarUrl: string; repositorySelection: string }
export interface GhRepo { id: number; name: string; fullName: string; owner: string; private: boolean; defaultBranch: string; language: string | null; htmlUrl: string; description: string | null }

export class GithubError extends Error {
  constructor(public code: "not-connected" | "token-expired" | "forbidden" | "unavailable", message: string) { super(message); }
}

export const authorizeUrl = (state: string) => {
  const e = env();
  const p = new URLSearchParams({ client_id: e.GITHUB_APP_CLIENT_ID, redirect_uri: `${e.APP_URL}/api/github/callback`, state });
  return `${GITHUB}/login/oauth/authorize?${p}`;
};

export const installUrl = () => `${GITHUB}/apps/${env().GITHUB_APP_SLUG}/installations/new`;

interface TokenResponse { access_token?: string; refresh_token?: string; expires_in?: number; refresh_token_expires_in?: number; error?: string }

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const e = env();
  const res = await fetch(`${GITHUB}/login/oauth/access_token`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: e.GITHUB_APP_CLIENT_ID, client_secret: e.GITHUB_APP_CLIENT_SECRET, ...params }),
    cache: "no-store",
  });
  if (!res.ok) throw new GithubError("unavailable", `GitHub token endpoint returned ${res.status}`);
  return res.json();
}

const expiry = (s?: number) => (s ? new Date(Date.now() + s * 1000 - 60_000) : null);

/** Complete the OAuth flow: exchange the code, then store the encrypted connection. */
export async function connectGithubAccount(userId: string, code: string) {
  const t = await tokenRequest({ code, redirect_uri: `${env().APP_URL}/api/github/callback` });
  if (!t.access_token) throw new GithubError("token-expired", `GitHub did not issue a token (${t.error ?? "unknown"})`);

  const gh = new Octokit({ auth: t.access_token });
  const { data: me } = await gh.rest.users.getAuthenticated();

  const data = {
    githubUserId: BigInt(me.id),
    githubLogin: me.login,
    avatarUrl: me.avatar_url,
    accessTokenEnc: encrypt(t.access_token),
    refreshTokenEnc: t.refresh_token ? encrypt(t.refresh_token) : null,
    accessTokenExpiresAt: expiry(t.expires_in),
    refreshTokenExpiresAt: expiry(t.refresh_token_expires_in),
  };
  await db.githubConnection.upsert({ where: { userId }, create: { userId, ...data }, update: data });
}

export const getConnection = (userId: string) =>
  db.githubConnection.findUnique({ where: { userId }, select: { githubLogin: true, avatarUrl: true } });

/** Octokit authenticated as the user; refreshes an expiring token when possible. */
async function userOctokit(userId: string): Promise<Octokit> {
  const c = await db.githubConnection.findUnique({ where: { userId } });
  if (!c) throw new GithubError("not-connected", "GitHub is not connected");

  let access = decrypt(c.accessTokenEnc);
  if (c.accessTokenExpiresAt && c.accessTokenExpiresAt < new Date()) {
    if (!c.refreshTokenEnc || (c.refreshTokenExpiresAt && c.refreshTokenExpiresAt < new Date())) {
      throw new GithubError("token-expired", "GitHub authorization expired");
    }
    const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: decrypt(c.refreshTokenEnc) });
    if (!t.access_token) throw new GithubError("token-expired", "GitHub authorization expired");
    access = t.access_token;
    await db.githubConnection.update({
      where: { userId },
      data: {
        accessTokenEnc: encrypt(t.access_token),
        refreshTokenEnc: t.refresh_token ? encrypt(t.refresh_token) : c.refreshTokenEnc,
        accessTokenExpiresAt: expiry(t.expires_in),
        refreshTokenExpiresAt: t.refresh_token_expires_in ? expiry(t.refresh_token_expires_in) : c.refreshTokenExpiresAt,
      },
    });
  }
  return new Octokit({ auth: access });
}

function wrap(e: unknown): never {
  const status = (e as { status?: number }).status;
  if (status === 401) throw new GithubError("token-expired", "GitHub authorization expired");
  if (status === 403 || status === 404) throw new GithubError("forbidden", "GitHub denied access to this resource");
  throw new GithubError("unavailable", "GitHub is unavailable");
}

export async function listInstallations(userId: string): Promise<GhInstallation[]> {
  const gh = await userOctokit(userId);
  try {
    const items = await gh.paginate(gh.rest.apps.listInstallationsForAuthenticatedUser, { per_page: 100 });
    // Only installations of THIS app are returned by the endpoint.
    return items.map((i) => {
      const acct = i.account as { login?: string; slug?: string; avatar_url?: string } | null;
      return { id: i.id, account: acct?.login ?? acct?.slug ?? "unknown", avatarUrl: acct?.avatar_url ?? "", repositorySelection: i.repository_selection };
    });
  } catch (e) { wrap(e); }
}

/** Repos in an installation that the user can access. Throws forbidden if the user can't use the installation. */
export async function listRepositories(userId: string, installationId: number): Promise<GhRepo[]> {
  const gh = await userOctokit(userId);
  try {
    const items = await gh.paginate(gh.rest.apps.listInstallationReposForAuthenticatedUser, { installation_id: installationId, per_page: 100 });
    return items.map((r) => ({
      id: r.id, name: r.name, fullName: r.full_name, owner: r.owner.login, private: r.private,
      defaultBranch: r.default_branch, language: r.language ?? null, htmlUrl: r.html_url, description: r.description ?? null,
    }));
  } catch (e) { wrap(e); }
}

export async function listBranches(userId: string, owner: string, repo: string): Promise<string[]> {
  const gh = await userOctokit(userId);
  try {
    const items = await gh.paginate(gh.rest.repos.listBranches, { owner, repo, per_page: 100 });
    return items.map((b) => b.name);
  } catch (e) { wrap(e); }
}

/** Octokit authenticated as the app installation (server-to-server). Callers must have authorized the project first. */
export async function installationOctokit(installationId: number) {
  const e = env();
  const { App } = await import("octokit");
  const app = new App({ appId: e.GITHUB_APP_ID, privateKey: e.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, "\n") });
  return app.getInstallationOctokit(installationId);
}

/** Short-lived installation token (for git operations / tarball download). */
export async function installationToken(installationId: number): Promise<string> {
  const oct = await installationOctokit(installationId);
  const auth = (await oct.auth({ type: "installation" })) as { token: string };
  return auth.token;
}
