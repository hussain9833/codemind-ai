-- CreateEnum
CREATE TYPE "HypothesisStatus" AS ENUM ('CANDIDATE', 'SUPPORTED', 'REFUTED', 'INCONCLUSIVE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InvestigationStatus" ADD VALUE 'INCONCLUSIVE';
ALTER TYPE "InvestigationStatus" ADD VALUE 'FAILED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EvidenceType" ADD VALUE 'LINE';
ALTER TYPE "EvidenceType" ADD VALUE 'DEPENDENCY';
ALTER TYPE "EvidenceType" ADD VALUE 'DOCUMENTATION';

-- AlterTable
ALTER TABLE "CodeChunk" ADD COLUMN     "embeddedAt" TIMESTAMP(3),
ADD COLUMN     "embeddingDim" INTEGER,
ADD COLUMN     "embeddingModel" TEXT;

-- AlterTable
ALTER TABLE "Investigation" ADD COLUMN     "error" TEXT,
ADD COLUMN     "plan" JSONB,
ADD COLUMN     "rootCauseDetail" JSONB;

-- AlterTable
ALTER TABLE "Hypothesis" ADD COLUMN     "status" "HypothesisStatus" NOT NULL DEFAULT 'CANDIDATE',
ADD COLUMN     "verification" TEXT;

-- AlterTable
ALTER TABLE "Evidence" ADD COLUMN     "dependency" TEXT,
ADD COLUMN     "reasons" TEXT[],
ADD COLUMN     "score" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "HypothesisEvidence" (
    "hypothesisId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "stance" "EvidenceStance" NOT NULL,

    CONSTRAINT "HypothesisEvidence_pkey" PRIMARY KEY ("hypothesisId","evidenceId")
);

-- CreateTable
CREATE TABLE "InvestigationEvent" (
    "id" TEXT NOT NULL,
    "investigationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvestigationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HypothesisEvidence_evidenceId_idx" ON "HypothesisEvidence"("evidenceId");

-- CreateIndex
CREATE INDEX "InvestigationEvent_investigationId_createdAt_idx" ON "InvestigationEvent"("investigationId", "createdAt");

-- CreateIndex
CREATE INDEX "CodeChunk_repositoryId_embeddingModel_idx" ON "CodeChunk"("repositoryId", "embeddingModel");

-- AddForeignKey
ALTER TABLE "HypothesisEvidence" ADD CONSTRAINT "HypothesisEvidence_hypothesisId_fkey" FOREIGN KEY ("hypothesisId") REFERENCES "Hypothesis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HypothesisEvidence" ADD CONSTRAINT "HypothesisEvidence_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestigationEvent" ADD CONSTRAINT "InvestigationEvent_investigationId_fkey" FOREIGN KEY ("investigationId") REFERENCES "Investigation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

