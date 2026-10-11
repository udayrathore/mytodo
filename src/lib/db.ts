import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const globalDb = globalThis as unknown as { prisma?: PrismaClient };
export function database() {
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL is not configured. Follow README setup.");
  if (!globalDb.prisma)
    globalDb.prisma = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL,
        options: "-c timezone=UTC",
        max: process.env.LOCAL_PGLITE === "1" ? 1 : 3,
        idleTimeoutMillis: 10000,
        connectionTimeoutMillis: 10000,
      }),
    });
  return globalDb.prisma;
}
