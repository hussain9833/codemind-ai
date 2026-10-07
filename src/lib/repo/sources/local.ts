import { execFileSync } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { CommitData, FileSource } from "../types";

/** FileSource over a local directory (used by tests and the verification script). */
export function localSource(root: string, branch = "local"): FileSource {
  let commitSha = "local";
  try { commitSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(); } catch {}
  return {
    commitSha,
    branch,
    async *files() {
      async function* walk(dir: string): AsyncGenerator<string> {
        for (const e of await readdir(dir, { withFileTypes: true })) {
          if (e.name === ".git" || e.name === "node_modules" || e.name === ".next") continue; // never descend (speed); filter.ts still applies to remote sources
          const p = join(dir, e.name);
          if (e.isDirectory()) yield* walk(p);
          else if (e.isFile()) yield p;
        }
      }
      for await (const abs of walk(root)) {
        const size = (await stat(abs)).size;
        yield { path: relative(root, abs).split(sep).join("/"), size, read: async () => (size > 2_000_000 ? null : readFile(abs, "utf8")) };
      }
    },
  };
}

/** Git history from a local checkout. */
export function localCommits(root: string, max = 100): CommitData[] {
  try {
    const out = execFileSync("git", ["log", `-n${max}`, "--name-only", "--format=@@%H%x1f%an%x1f%aI%x1f%s"], { cwd: root, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
    return out.split("@@").filter(Boolean).map((block) => {
      const [head, ...rest] = block.split("\n");
      const [sha, authorName, date, message] = head!.split("\x1f");
      return { sha: sha!, authorName: authorName!, authoredAt: new Date(date!), message: message!, files: rest.map((l) => l.trim()).filter(Boolean) };
    });
  } catch { return []; }
}
