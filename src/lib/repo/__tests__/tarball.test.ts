import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildIndex } from "../pipeline";
import { localSource } from "../sources/local";
import { tarballSource } from "../sources/tarball";

const root = process.env.CM_FIXTURE_REPO;

/** The GitHub ingestion path (tarball → FileSource) must index exactly what a checkout does. */
describe.skipIf(!root || !existsSync(root))("tarball ingestion", () => {
  it("produces the same index as a local checkout", async () => {
    const out = join(mkdtempSync(join(tmpdir(), "cm-")), "repo.tar.gz");
    execFileSync("git", ["archive", "--format=tar.gz", "--prefix=owner-repo-abc/", "-o", out, "HEAD"], { cwd: root });
    const fromTar = await buildIndex(await tarballSource(createReadStream(out), "abc", "main"));
    const fromDir = await buildIndex(localSource(root!));
    expect(fromTar.files.map((f) => f.path).sort()).toEqual(fromDir.files.map((f) => f.path).sort());
    expect(fromTar.stats.symbols).toBe(fromDir.stats.symbols);
    expect(fromTar.stats.chunks).toBe(fromDir.stats.chunks);
  });
});
