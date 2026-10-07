import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findEvidence } from "../evidence";
import { memoryReader } from "../memory";
import { buildIndex } from "../pipeline";
import { localCommits, localSource } from "../sources/local";

/** Real-repository verification. Set CM_FIXTURE_REPO to a git checkout and CM_FIXTURE_QUERY optionally. */
const root = process.env.CM_FIXTURE_REPO;
const query = process.env.CM_FIXTURE_QUERY ?? "Find everything related to authentication";

describe.skipIf(!root || !existsSync(root))("real repository", () => {
  it("indexes it and finds evidence without an LLM", async () => {
    const index = await buildIndex(localSource(root!));
    const commits = localCommits(root!);
    const a = index.analysis;
    console.log("STATS", JSON.stringify(index.stats));
    console.log("ANALYSIS", JSON.stringify({ languages: a.languages.slice(0, 4), frameworks: a.frameworks, pm: a.packageManagers, deps: a.dependencies.length, entry: a.entryPoints, routes: a.apiRoutes.length, auth: a.authentication, db: a.database, tests: a.tests, services: a.externalServices, dirs: a.importantDirectories.slice(0, 6) }));
    const { evidence } = await findEvidence(memoryReader(index, commits), query, { limit: 40 });
    console.log("QUERY:", query);
    for (const e of evidence) console.log(`${String(e.score).padStart(7)}  ${e.kind.padEnd(13)} ${e.title.slice(0, 70).padEnd(70)} ${e.reasons.join("; ").slice(0, 80)}`);
    expect(index.stats.filesIndexed).toBeGreaterThan(5);
    expect(evidence.length).toBeGreaterThan(5);
  });
});
