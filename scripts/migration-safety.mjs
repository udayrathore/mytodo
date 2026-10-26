export const retiredReset = "202610240009_clean_start";
// Ledger only: never modify a migration file already deployed to a database.
export async function retireDataReset(db, run) {
  const exists = await db.query(
    "SELECT to_regclass('public._prisma_migrations') AS name",
  );
  const records = exists.rows[0].name
    ? (
        await db.query(
          "SELECT finished_at, rolled_back_at FROM _prisma_migrations WHERE migration_name=$1",
          [retiredReset],
        )
      ).rows
    : [];
  if (records.some((r) => !r.finished_at && !r.rolled_back_at))
    throw Error(
      "The historical reset has an unresolved failed migration. Inspect it before continuing.",
    );
  if (!records.some((r) => r.finished_at && !r.rolled_back_at)) {
    await run(["prisma", "migrate", "resolve", "--applied", retiredReset]);
  }
}
