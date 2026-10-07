import "server-only";
import { z } from "zod";

/**
 * Validated, server-only environment. Never import this from a client component
 * ("server-only" makes the build fail if you do). Secrets are read lazily so that
 * `next build` and pages that don't need a given secret still work without it.
 */
/** "" -> undefined so `KEY=""` in .env behaves like an unset variable. */
const blank = <T extends z.ZodTypeAny>(t: T) => z.preprocess((v) => (v === "" ? undefined : v), t);

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),

  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),

  /** 32 bytes, base64. Encrypts GitHub tokens at rest. Generate: openssl rand -base64 32 */
  ENCRYPTION_KEY: z.string().refine((v) => Buffer.from(v, "base64").length === 32, "must be 32 bytes, base64-encoded"),

  GITHUB_APP_ID: z.string().min(1),
  GITHUB_APP_SLUG: z.string().min(1),
  GITHUB_APP_CLIENT_ID: z.string().min(1),
  GITHUB_APP_CLIENT_SECRET: z.string().min(1),
  /** PEM private key. Newlines may be written as \n. */
  GITHUB_APP_PRIVATE_KEY: z.string().min(1),

  /** NVIDIA NIM (server-side only). Empty strings are treated as unset. */
  NVIDIA_API_KEY: blank(z.string().min(1).optional()),
  NVIDIA_BASE_URL: blank(z.string().url().optional()),
  /** Primary chat model. A model that stalls or is retired is skipped via the fallback chain. */
  NVIDIA_CHAT_MODEL: blank(z.string().min(1).optional()),
  /** Comma-separated fallbacks, tried in order when the primary times out or is unavailable. */
  NVIDIA_CHAT_FALLBACK_MODELS: blank(z.string().optional()),
  NVIDIA_EMBED_MODEL: blank(z.string().min(1).optional()),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Report variable NAMES only, never values.
    const names = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration — ${names}`);
  }
  cached = parsed.data;
  return cached;
}

/** True when GitHub App variables are all present (lets the UI show setup guidance). */
export function githubConfigured(): boolean {
  return ["GITHUB_APP_ID", "GITHUB_APP_SLUG", "GITHUB_APP_CLIENT_ID", "GITHUB_APP_CLIENT_SECRET", "GITHUB_APP_PRIVATE_KEY", "ENCRYPTION_KEY"].every((k) => !!process.env[k]);
}

export const nvidiaConfigured = () => !!process.env.NVIDIA_API_KEY;
