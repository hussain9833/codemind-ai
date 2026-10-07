import { existsSync } from "node:fs";
import { describe, it } from "vitest";
import { embedRepository } from "@/lib/ai/embed-repo";
import { trackedProvider } from "@/lib/ai/execution";
import { getAIProvider } from "@/lib/ai/nvidia";
import { hashPassword } from "@/lib/crypto";
import { db } from "@/lib/db";
import { buildIndex } from "../pipeline";
import { persistIndex } from "../service";
import { localCommits, localSource } from "../sources/local";

/** Dev helper: attaches the fixture repo (indexed) to an existing user. Set CM_SEED_EMAIL. */
const email = process.env.CM_SEED_EMAIL;
const root = process.env.CM_FIXTURE_REPO;

describe.skipIf(!email || !root || !existsSync(root))("seed", () => {
  it("creates an indexed project for the user", async () => {
    const user = await db.user.upsert({ where: { email: email! }, update: {}, create: { email: email!, name: "Seed User", passwordHash: await hashPassword("correct-horse-battery") } });
    const built = await buildIndex(localSource(root!));
    const project = await db.project.create({ data: { userId: user.id, name: "realworld-api", branch: "main", repository: { create: { githubRepoId: BigInt(42), githubInstallationId: BigInt(7), owner: "gothinkster", name: "node-express-realworld-example-app", fullName: "gothinkster/node-express-realworld-example-app", defaultBranch: "main", isPrivate: false, htmlUrl: "https://github.com/gothinkster/node-express-realworld-example-app", indexStatus: "INDEXED", lastIndexedAt: new Date(), lastIndexedSha: built.commitSha, indexedBranch: "main", analysis: built.analysis as never, indexStats: built.stats as never, language: built.analysis.languages[0]?.language, framework: built.analysis.frameworks.join(", ") } } }, include: { repository: true } });
    await persistIndex(project.repository!.id, built, localCommits(root!));
    if (process.env.CM_SEED_EMBED) await embedRepository(project.repository!.id, trackedProvider(getAIProvider(), { userId: user.id, projectId: project.id }), 200_000);
    console.log("SEEDED", project.id);
    await db.$disconnect();
  });
});
