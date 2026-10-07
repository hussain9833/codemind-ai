import ignore, { type Ignore } from "ignore";

export const MAX_FILE_BYTES = 512 * 1024;
export const MAX_FILES = 20_000;
export const MAX_TOTAL_BYTES = 150 * 1024 * 1024;

const IGNORED_DIRS = new Set([
  "node_modules", ".git", ".next", ".nuxt", ".svelte-kit", "dist", "build", "out", "coverage", ".turbo", ".cache",
  ".vercel", ".idea", ".vscode", "__pycache__", ".venv", "venv", "target", "vendor", ".gradle", ".pytest_cache", ".parcel-cache", "bower_components", ".terraform",
]);

const BINARY_EXT = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "ico", "bmp", "tiff", "svg", "avif", "heic",
  "mp4", "mov", "avi", "mkv", "webm", "mp3", "wav", "ogg", "flac",
  "zip", "tar", "gz", "tgz", "bz2", "7z", "rar", "jar", "war",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "woff", "woff2", "ttf", "otf", "eot",
  "exe", "dll", "so", "dylib", "bin", "class", "o", "a", "wasm", "pyc", "db", "sqlite", "lock-binary",
  "map", "psd", "ai", "sketch",
]);

const GENERATED_NAMES = [/\.min\.(js|css)$/i, /\.bundle\.js$/i, /\.generated\.[a-z]+$/i, /\.g\.dart$/i, /_pb2\.py$/i, /\.pb\.go$/i, /\.d\.ts$/i, /\.snap$/i];
const LOCKFILES = new Set(["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "bun.lock", "Cargo.lock", "poetry.lock", "Pipfile.lock", "composer.lock", "Gemfile.lock", "go.sum"]);

/** Secrets must never enter the index (and later, never reach an LLM prompt). */
const SECRET_FILES = [/(^|\/)\.env(\..*)?$/i, /\.(pem|key|p12|pfx|jks|keystore)$/i, /(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/, /(^|\/)\.npmrc$/, /(^|\/)\.netrc$/, /(^|\/)credentials(\.json)?$/i, /(^|\/)secrets?\.(json|ya?ml|toml)$/i];
const ENV_EXAMPLE = /(^|\/)\.env\.(example|sample|template)$/i;

const GENERATED_HEADER = /^(?:\s*(?:\/\/|\/\*|#|\*)\s*)?(?:@generated|auto-?generated|this file (?:is|was) (?:automatically )?generated|do not edit)/im;

export type SkipReason = "ignored-dir" | "binary" | "generated" | "lockfile" | "secret" | "too-large" | "gitignore" | "empty";

export interface PathFilter {
  /** Decide from path+size alone (cheap, before reading content). */
  check(path: string, size: number): SkipReason | null;
}

export function createPathFilter(gitignoreText?: string | null): PathFilter {
  const ig: Ignore | null = gitignoreText ? ignore().add(gitignoreText) : null;
  return {
    check(path, size) {
      const parts = path.split("/");
      if (parts.slice(0, -1).some((p) => IGNORED_DIRS.has(p))) return "ignored-dir";
      const name = parts[parts.length - 1]!;
      if (ENV_EXAMPLE.test(path)) return size > MAX_FILE_BYTES ? "too-large" : null;
      if (SECRET_FILES.some((r) => r.test(path))) return "secret";
      if (LOCKFILES.has(name)) return "lockfile";
      const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
      if (BINARY_EXT.has(ext)) return "binary";
      if (GENERATED_NAMES.some((r) => r.test(name))) return "generated";
      if (size === 0) return "empty";
      if (size > MAX_FILE_BYTES) return "too-large";
      if (ig && ig.ignores(path)) return "gitignore";
      return null;
    },
  };
}

/** Content checks after reading: NUL bytes mean binary; header markers mean generated. */
export function contentSkipReason(content: string): SkipReason | null {
  if (content.includes("\u0000")) return "binary";
  if (GENERATED_HEADER.test(content.slice(0, 400))) return "generated";
  return null;
}
