import "dotenv/config";
import { database } from "../src/lib/db";
const db = database();
try {
  if (!process.env.OWNER_EMAIL) throw new Error("Set OWNER_EMAIL first.");
  const user = await db.user.findUniqueOrThrow({
    where: { email: process.env.OWNER_EMAIL.toLowerCase() },
  });
  await db.$transaction(async (tx) => {
    const names = [
      "Environment Control",
      "Health",
      "Relationship",
      "Sales & Marketing",
      "Creativity",
      "Operations",
      "Finances",
    ];
    const roots = new Map<string, string>();
    for (const [sortOrder, name] of names.entries()) {
      const existing = await tx.category.findFirst({
        where: { userId: user.id, name },
      });
      const data = { name, parentId: null, isActive: true, sortOrder };
      const c = existing
        ? await tx.category.update({ where: { id: existing.id }, data })
        : await tx.category.create({
            data: {
              ...data,
              userId: user.id,
              slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
            },
          });
      roots.set(name, c.id);
    }
    // Preserve sample categories and every task/history link while nesting the old roots.
    for (const [name, parent] of [
      ["Work", "Operations"],
      ["Personal", "Environment Control"],
      ["Design & craft", "Creativity"],
      ["Guitar", "Creativity"],
      ["Reading", "Creativity"],
      ["Business", "Sales & Marketing"],
    ]) {
      const old = await tx.category.findFirst({
        where: { userId: user.id, name },
      });
      if (old)
        await tx.category.update({
          where: { id: old.id },
          data: { parentId: roots.get(parent)! },
        });
    }
  });
  console.log(
    "Seven parent categories configured; existing tasks and history preserved.",
  );
} finally {
  await db.$disconnect();
}
