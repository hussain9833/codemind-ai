-- AlterTable
ALTER TABLE "User" ADD COLUMN     "recoveryCodeAt" TIMESTAMP(3),
ADD COLUMN     "recoveryCodeHash" TEXT;
