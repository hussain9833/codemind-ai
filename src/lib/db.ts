import "server-only";
import { PrismaClient } from "@prisma/client";

// Reuse one client across hot reloads in dev to avoid exhausting connections.
const g = globalThis as unknown as { prisma?: PrismaClient };

export const db: PrismaClient =
  g.prisma ?? new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });

if (process.env.NODE_ENV !== "production") g.prisma = db;
