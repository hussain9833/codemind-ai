// Owner-only emergency reset for when BOTH the password and the recovery code are lost.
// It needs your server's .env.local (database + ENCRYPTION_KEY), so only someone with server access can run it.
//
//   npm run admin:reset-password -- you@example.com
//
// It asks for the new password (hidden), saves it, signs the account out everywhere,
// and prints a NEW recovery code once.
import { createHmac, randomBytes, randomInt, scryptSync } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email.includes("@")) { console.error("Usage: npm run admin:reset-password -- you@example.com"); process.exit(1); }

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)="?(.*?)"?$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
if (!process.env.DATABASE_URL || !process.env.ENCRYPTION_KEY) { console.error("DATABASE_URL and ENCRYPTION_KEY must be set in .env.local"); process.exit(1); }

/** Reads a line from the terminal without echoing it. */
function askHidden(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    stdin.setRawMode?.(true); stdin.resume(); stdin.setEncoding("utf8");
    let value = "";
    const onData = (ch) => {
      for (const c of ch) {
        if (c === "\r" || c === "\n") { stdin.setRawMode?.(false); stdin.pause(); stdin.off("data", onData); process.stdout.write("\n"); return resolve(value); }
        if (c === "\u0003") process.exit(130);
        if (c === "\u007f" || c === "\b") value = value.slice(0, -1); else value += c;
      }
    };
    stdin.on("data", onData);
  });
}

const password = await askHidden("New password (min 10 characters): ");
const confirm = await askHidden("Repeat new password: ");
if (password.length < 10) { console.error("Password must be at least 10 characters."); process.exit(1); }
if (password !== confirm) { console.error("Passwords do not match."); process.exit(1); }

// Same formats as src/lib/crypto.ts and src/lib/recovery.ts
const salt = randomBytes(16);
const key = scryptSync(password, salt, 64, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
const passwordHash = `scrypt$${2 ** 15}$${salt.toString("base64")}$${key.toString("base64")}`;

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
let raw = ""; for (let i = 0; i < 20; i++) raw += ALPHABET[randomInt(ALPHABET.length)];
const code = raw.match(/.{5}/g).join("-");
const recoveryCodeHash = createHmac("sha256", Buffer.from(process.env.ENCRYPTION_KEY, "base64")).update(raw).digest("hex");

const db = new PrismaClient();
try {
  const user = await db.user.findUnique({ where: { email } });
  if (!user) { console.error(`No account found for ${email}`); process.exit(1); }
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { passwordHash, recoveryCodeHash, recoveryCodeAt: new Date() } }),
    db.session.deleteMany({ where: { userId: user.id } }),
  ]);
  console.log(`\nPassword reset for ${email}. All sessions were signed out.`);
  console.log(`NEW recovery code (shown once, store it safely): ${code}\n`);
} finally {
  await db.$disconnect();
}
