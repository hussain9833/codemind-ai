-- AlterTable
ALTER TABLE "Repository" ADD COLUMN     "analysis" JSONB,
ADD COLUMN     "indexError" TEXT,
ADD COLUMN     "indexProgress" JSONB,
ADD COLUMN     "indexStats" JSONB,
ADD COLUMN     "indexedBranch" TEXT;

-- AlterTable
ALTER TABLE "CodeChunk" ADD COLUMN     "branch" TEXT,
ADD COLUMN     "imports" TEXT[],
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'file-part';

-- CreateTable
CREATE TABLE "RepoFile" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "size" INTEGER NOT NULL,
    "lineCount" INTEGER NOT NULL,
    "sha" TEXT NOT NULL,
    "imports" TEXT[],
    "exports" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepoFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepoSymbol" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "parent" TEXT,
    "lineStart" INTEGER NOT NULL,
    "lineEnd" INTEGER NOT NULL,
    "exported" BOOLEAN NOT NULL DEFAULT false,
    "signature" TEXT NOT NULL,
    "meta" JSONB,

    CONSTRAINT "RepoSymbol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepoCommit" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "sha" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authoredAt" TIMESTAMP(3) NOT NULL,
    "files" TEXT[],

    CONSTRAINT "RepoCommit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RepoFile_repositoryId_category_idx" ON "RepoFile"("repositoryId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "RepoFile_repositoryId_path_key" ON "RepoFile"("repositoryId", "path");

-- CreateIndex
CREATE INDEX "RepoSymbol_repositoryId_name_idx" ON "RepoSymbol"("repositoryId", "name");

-- CreateIndex
CREATE INDEX "RepoSymbol_fileId_idx" ON "RepoSymbol"("fileId");

-- CreateIndex
CREATE INDEX "RepoCommit_repositoryId_authoredAt_idx" ON "RepoCommit"("repositoryId", "authoredAt");

-- CreateIndex
CREATE UNIQUE INDEX "RepoCommit_repositoryId_sha_key" ON "RepoCommit"("repositoryId", "sha");

-- AddForeignKey
ALTER TABLE "RepoFile" ADD CONSTRAINT "RepoFile_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepoSymbol" ADD CONSTRAINT "RepoSymbol_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepoSymbol" ADD CONSTRAINT "RepoSymbol_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "RepoFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepoCommit" ADD CONSTRAINT "RepoCommit_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Trigram index for exact/substring source search (pg_trgm ships with Neon).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "CodeChunk_content_trgm_idx" ON "CodeChunk" USING gin ("content" gin_trgm_ops);
