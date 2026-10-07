import type { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import tar from "tar-stream";
import { createPathFilter, MAX_FILE_BYTES } from "../filter";
import type { FileSource } from "../types";

export const MAX_ARCHIVE_BYTES = 250 * 1024 * 1024;

/**
 * Turns a gzipped tarball stream (GitHub's /tarball format: one leading directory) into a
 * FileSource. Only text-sized files that pass the cheap path filter are buffered; everything
 * else is recorded by size so the pipeline can still count it as skipped.
 */
export async function tarballSource(body: Readable, commitSha: string, branch: string): Promise<FileSource> {
  const quick = createPathFilter(null);
  const store = new Map<string, { size: number; data: Buffer | null }>();
  let received = 0;

  await new Promise<void>((resolve, reject) => {
    const extract = tar.extract();
    extract.on("entry", (header, stream, next) => {
      const path = header.name.split("/").slice(1).join("/"); // drop "owner-repo-sha/"
      const size = header.size ?? 0;
      const keep = header.type === "file" && path && !quick.check(path, size) && size <= MAX_FILE_BYTES;
      if (!keep) {
        if (header.type === "file" && path) store.set(path, { size, data: null });
        stream.on("end", next);
        stream.resume();
        return;
      }
      const parts: Buffer[] = [];
      stream.on("data", (c: unknown) => { parts.push(c as Buffer); });
      stream.on("end", () => { store.set(path, { size, data: Buffer.concat(parts) }); next(); });
      stream.on("error", reject);
    });
    extract.on("finish", resolve);
    extract.on("error", reject);

    const gunzip = createGunzip();
    gunzip.on("error", reject);
    body.on("data", (c: unknown) => {
      received += (c as Buffer).length;
      if (received > MAX_ARCHIVE_BYTES) body.destroy(new Error("Repository archive is too large to index"));
    });
    body.on("error", reject);
    body.pipe(gunzip).pipe(extract);
  });

  return {
    commitSha,
    branch,
    async *files() {
      for (const [path, v] of store) yield { path, size: v.size, read: async () => (v.data ? v.data.toString("utf8") : null) };
    },
  };
}
