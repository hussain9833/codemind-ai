CREATE EXTENSION IF NOT EXISTS vector;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "IndexStatus" AS ENUM ('NOT_INDEXED', 'INDEXING', 'INDEXED', 'FAILED');

-- CreateEnum
CREATE TYPE "InvestigationStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'ROOT_CAUSE', 'FIX_PROPOSED', 'VALIDATED', 'CLOSED');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "Level" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('FILE', 'SYMBOL', 'COMMIT', 'LOG', 'TEST');

-- CreateEnum
CREATE TYPE "EvidenceStance" AS ENUM ('SUPPORTS', 'CONTRADICTS', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "PatchStatus" AS ENUM ('PROPOSED', 'APPROVED', 'REJECTED', 'APPLIED');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('NOT_RUN', 'PENDING', 'RUNNING', 'PASSED', 'FAILED');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'MONITORING', 'RESOLVED');

-- CreateEnum
CREATE TYPE "PullRequestStatus" AS ENUM ('DRAFT', 'OPEN', 'MERGED', 'CLOSED');

-- CreateEnum
CREATE TYPE "AIExecutionStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ArchitectureNodeKind" AS ENUM ('MODULE', 'FILE', 'SERVICE', 'EXTERNAL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GithubConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "githubUserId" BIGINT NOT NULL,
    "githubLogin" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GithubConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "branch" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Repository" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "githubRepoId" BIGINT NOT NULL,
    "githubInstallationId" BIGINT NOT NULL,
    "owner" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "defaultBranch" TEXT NOT NULL,
    "isPrivate" BOOLEAN NOT NULL,
    "htmlUrl" TEXT NOT NULL,
    "language" TEXT,
    "framework" TEXT,
    "indexStatus" "IndexStatus" NOT NULL DEFAULT 'NOT_INDEXED',
    "lastIndexedAt" TIMESTAMP(3),
    "lastIndexedSha" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Repository_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeChunk" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "startLine" INTEGER NOT NULL,
    "endLine" INTEGER NOT NULL,
    "language" TEXT,
    "symbol" TEXT,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "commitSha" TEXT,
    "embedding" vector,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodeChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Investigation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "status" "InvestigationStatus" NOT NULL DEFAULT 'OPEN',
    "severity" "Severity" NOT NULL DEFAULT 'MEDIUM',
    "confidence" "Level",
    "rootCause" TEXT,
    "rootCauseLevel" "Level",
    "incidentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Investigation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hypothesis" (
    "id" TEXT NOT NULL,
    "investigationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "likelihood" "Level" NOT NULL,
    "isRootCause" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hypothesis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "investigationId" TEXT NOT NULL,
    "hypothesisId" TEXT,
    "type" "EvidenceType" NOT NULL,
    "stance" "EvidenceStance" NOT NULL DEFAULT 'NEUTRAL',
    "title" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "filePath" TEXT,
    "startLine" INTEGER,
    "endLine" INTEGER,
    "symbol" TEXT,
    "commitSha" TEXT,
    "excerpt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patch" (
    "id" TEXT NOT NULL,
    "investigationId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "diff" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "risk" "Level" NOT NULL,
    "status" "PatchStatus" NOT NULL DEFAULT 'PROPOSED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Patch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestRun" (
    "id" TEXT NOT NULL,
    "investigationId" TEXT NOT NULL,
    "patchId" TEXT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'NOT_RUN',
    "output" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "severity" "Severity" NOT NULL DEFAULT 'MEDIUM',
    "source" TEXT,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PullRequest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "investigationId" TEXT,
    "githubNumber" INTEGER,
    "title" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "htmlUrl" TEXT,
    "status" "PullRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PullRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIExecution" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "investigationId" TEXT,
    "purpose" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" "AIExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "latencyMs" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArchitectureNode" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "ArchitectureNodeKind" NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArchitectureNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArchitectureEdge" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fromNodeId" TEXT NOT NULL,
    "toNodeId" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArchitectureEdge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "GithubConnection_userId_key" ON "GithubConnection"("userId");

-- CreateIndex
CREATE INDEX "GithubConnection_githubUserId_idx" ON "GithubConnection"("githubUserId");

-- CreateIndex
CREATE INDEX "Project_userId_createdAt_idx" ON "Project"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Repository_projectId_key" ON "Repository"("projectId");

-- CreateIndex
CREATE INDEX "Repository_githubRepoId_idx" ON "Repository"("githubRepoId");

-- CreateIndex
CREATE INDEX "Repository_githubInstallationId_idx" ON "Repository"("githubInstallationId");

-- CreateIndex
CREATE INDEX "CodeChunk_repositoryId_filePath_idx" ON "CodeChunk"("repositoryId", "filePath");

-- CreateIndex
CREATE INDEX "CodeChunk_repositoryId_contentHash_idx" ON "CodeChunk"("repositoryId", "contentHash");

-- CreateIndex
CREATE INDEX "Investigation_projectId_status_idx" ON "Investigation"("projectId", "status");

-- CreateIndex
CREATE INDEX "Investigation_projectId_createdAt_idx" ON "Investigation"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "Investigation_incidentId_idx" ON "Investigation"("incidentId");

-- CreateIndex
CREATE INDEX "Hypothesis_investigationId_idx" ON "Hypothesis"("investigationId");

-- CreateIndex
CREATE INDEX "Evidence_investigationId_idx" ON "Evidence"("investigationId");

-- CreateIndex
CREATE INDEX "Evidence_hypothesisId_idx" ON "Evidence"("hypothesisId");

-- CreateIndex
CREATE INDEX "Patch_investigationId_status_idx" ON "Patch"("investigationId", "status");

-- CreateIndex
CREATE INDEX "TestRun_investigationId_idx" ON "TestRun"("investigationId");

-- CreateIndex
CREATE INDEX "TestRun_patchId_idx" ON "TestRun"("patchId");

-- CreateIndex
CREATE INDEX "Incident_projectId_status_idx" ON "Incident"("projectId", "status");

-- CreateIndex
CREATE INDEX "PullRequest_projectId_status_idx" ON "PullRequest"("projectId", "status");

-- CreateIndex
CREATE INDEX "PullRequest_investigationId_idx" ON "PullRequest"("investigationId");

-- CreateIndex
CREATE INDEX "AIExecution_projectId_createdAt_idx" ON "AIExecution"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "AIExecution_investigationId_idx" ON "AIExecution"("investigationId");

-- CreateIndex
CREATE INDEX "ArchitectureNode_projectId_idx" ON "ArchitectureNode"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ArchitectureNode_projectId_kind_name_key" ON "ArchitectureNode"("projectId", "kind", "name");

-- CreateIndex
CREATE INDEX "ArchitectureEdge_projectId_idx" ON "ArchitectureEdge"("projectId");

-- CreateIndex
CREATE INDEX "ArchitectureEdge_toNodeId_idx" ON "ArchitectureEdge"("toNodeId");

-- CreateIndex
CREATE UNIQUE INDEX "ArchitectureEdge_fromNodeId_toNodeId_relation_key" ON "ArchitectureEdge"("fromNodeId", "toNodeId", "relation");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GithubConnection" ADD CONSTRAINT "GithubConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repository" ADD CONSTRAINT "Repository_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeChunk" ADD CONSTRAINT "CodeChunk_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investigation" ADD CONSTRAINT "Investigation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investigation" ADD CONSTRAINT "Investigation_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hypothesis" ADD CONSTRAINT "Hypothesis_investigationId_fkey" FOREIGN KEY ("investigationId") REFERENCES "Investigation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_investigationId_fkey" FOREIGN KEY ("investigationId") REFERENCES "Investigation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_hypothesisId_fkey" FOREIGN KEY ("hypothesisId") REFERENCES "Hypothesis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patch" ADD CONSTRAINT "Patch_investigationId_fkey" FOREIGN KEY ("investigationId") REFERENCES "Investigation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestRun" ADD CONSTRAINT "TestRun_investigationId_fkey" FOREIGN KEY ("investigationId") REFERENCES "Investigation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestRun" ADD CONSTRAINT "TestRun_patchId_fkey" FOREIGN KEY ("patchId") REFERENCES "Patch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PullRequest" ADD CONSTRAINT "PullRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PullRequest" ADD CONSTRAINT "PullRequest_investigationId_fkey" FOREIGN KEY ("investigationId") REFERENCES "Investigation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIExecution" ADD CONSTRAINT "AIExecution_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIExecution" ADD CONSTRAINT "AIExecution_investigationId_fkey" FOREIGN KEY ("investigationId") REFERENCES "Investigation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchitectureNode" ADD CONSTRAINT "ArchitectureNode_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchitectureEdge" ADD CONSTRAINT "ArchitectureEdge_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchitectureEdge" ADD CONSTRAINT "ArchitectureEdge_fromNodeId_fkey" FOREIGN KEY ("fromNodeId") REFERENCES "ArchitectureNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchitectureEdge" ADD CONSTRAINT "ArchitectureEdge_toNodeId_fkey" FOREIGN KEY ("toNodeId") REFERENCES "ArchitectureNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

