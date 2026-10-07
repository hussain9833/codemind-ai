// Runs a command with variables from .env.local loaded (Prisma CLI only reads .env).
// Usage: node scripts/with-env.mjs prisma migrate deploy
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const env = { ...process.env };
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!m || env[m[1]] !== undefined) continue;
    let v = m[2].trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1).replace(/\n/g, "\n").replace(/\\"/g, '"');
    env[m[1]] = v;
  }
}
const [cmd, ...args] = process.argv.slice(2);
const r = spawnSync(cmd, args, { stdio: "inherit", env, shell: process.platform === "win32" });
process.exit(r.status ?? 1);
