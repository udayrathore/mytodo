import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const globalDb = globalThis as unknown as {
  prisma?: PrismaClient;
  schemaVersion?: string;
};
// Regeneration must replace a cached pre-migration client during development HMR.
const schemaVersion = "20261030-web-push";
export function database() {
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL is not configured. Follow README setup.");
  if (!globalDb.prisma || globalDb.schemaVersion !== schemaVersion) {
    const previous = globalDb.prisma;
    globalDb.prisma = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL,
        options: "-c timezone=UTC",
        max: process.env.LOCAL_PGLITE === "1" ? 1 : 3,
        idleTimeoutMillis: 10000,
        connectionTimeoutMillis: 10000,
      }),
    });
    globalDb.schemaVersion = schemaVersion;
    if (previous) void previous.$disconnect().catch(() => {});
  }
  return globalDb.prisma;
}
