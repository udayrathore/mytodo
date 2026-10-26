import "dotenv/config";
import { database } from "../src/lib/db";
import { addDays, asDate, dateKey, weekOf } from "../src/lib/domain";
const db = database();
if (!process.env.OWNER_EMAIL) throw new Error("Set OWNER_EMAIL first.");
const user = await db.user.upsert({
  where: { email: process.env.OWNER_EMAIL.toLowerCase() },
  create: {
    email: process.env.OWNER_EMAIL.toLowerCase(),
    name: process.env.OWNER_NAME || "Uday",
    timezone: process.env.APP_TIMEZONE || "Asia/Kolkata",
  },
  update: {},
});
if (await db.task.count({ where: { userId: user.id } })) {
  console.log(
    "Seed skipped: owner already has tasks. Nothing was overwritten.",
  );
  await db.$disconnect();
  process.exit(0);
}
const userId = user.id;
const today = dateKey(new Date(), user.timezone);
const week = weekOf(today);
await db.$transaction(
  async (tx) => {
    const cat = async (
      name: string,
      slug: string,
      parentId: string | null = null,
      sortOrder = 0,
    ) =>
      tx.category.create({ data: { userId, name, slug, parentId, sortOrder } });
    await cat("Environment Control", "environment-control", null, 0);
    const health = await cat("Health", "health", null, 1);
    await cat("Relationship", "relationship", null, 2);
    const sales = await cat("Sales & Marketing", "sales-marketing", null, 3);
    const creativity = await cat("Creativity", "creativity", null, 4);
    await cat("Operations", "operations", null, 5);
    await cat("Finances", "finances", null, 6);
    const design = await cat("Design & craft", "design", creativity.id, 0);
    const business = await cat("Business", "business", sales.id, 0);
    const movement = await cat("Movement", "movement", health.id);
    const music = await cat("Guitar", "guitar", creativity.id, 1);
    await cat("Reading", "reading", creativity.id, 2);
    const deep = await tx.tag.create({
      data: { userId, name: "deep work", slug: "deep-work" },
    });
    const follow = await tx.tag.create({
      data: { userId, name: "follow-up", slug: "follow-up" },
    });
    const practice = await tx.tag.create({
      data: { userId, name: "practice", slug: "practice" },
    });
    const org = await tx.entity.create({
      data: {
        userId,
        name: "ArtWorksIT",
        type: "ORGANIZATION",
        description: "Independent design and development studio",
      },
    });
    const client = await tx.entity.create({
      data: {
        userId,
        name: "Atoll Solutions",
        type: "CLIENT",
        parentEntityId: org.id,
      },
    });
    const project = await tx.entity.create({
      data: {
        userId,
        name: "Atoll website",
        type: "PROJECT",
        parentEntityId: client.id,
      },
    });
    const person = await tx.entity.create({
      data: {
        userId,
        name: "Varun",
        type: "PERSON",
        description: "Design collaborator",
      },
    });
    const current = await tx.planningPeriod.create({
      data: {
        userId,
        title: "This week",
        startsOn: asDate(week.start)!,
        endsOn: asDate(week.end)!,
      },
    });
    const previous = await tx.planningPeriod.create({
      data: {
        userId,
        title: "Last week",
        startsOn: asDate(addDays(week.start, -7))!,
        endsOn: asDate(addDays(week.end, -7))!,
        status: "CLOSED",
      },
    });
    await tx.planningPeriod.create({
      data: {
        userId,
        title: "Next week",
        startsOn: asDate(addDays(week.start, 7))!,
        endsOn: asDate(addDays(week.end, 7))!,
      },
    });
    const items = [
      {
        title: "Refine the Atoll homepage",
        description:
          "Simplify the opening story. Explore a quieter hero, clearer service hierarchy, and a stronger mobile layout.",
        cat: design.id,
        urgency: 8, importance: 8,
        status: "IN_PROGRESS",
        estimate: 90,
        entities: [project.id, client.id],
        tags: [deep.id],
        minutes: 55,
      },
      {
        title: "Send the revised project proposal",
        description:
          "Fold in the feedback from our last conversation and clarify the handoff milestones.",
        cat: business.id,
        urgency: 8, importance: 8,
        status: "PLANNED",
        estimate: 30,
        entities: [client.id, person.id],
        tags: [follow.id],
        minutes: 0,
      },
      {
        title: "Guitar: bends and a little patience",
        description:
          "Slow practice. Listen for the note before reaching for it.",
        cat: music.id,
        urgency: 5, importance: 5,
        status: "PLANNED",
        estimate: 25,
        entities: [],
        tags: [practice.id],
        minutes: 0,
      },
      {
        title: "Take the long route outside",
        description: "A walk without headphones.",
        cat: movement.id,
        urgency: 2, importance: 2,
        status: "COMPLETED",
        estimate: 30,
        entities: [],
        tags: [],
        minutes: 35,
      },
      {
        title: "Explore a better client handoff",
        description: "What would make the next project easier to maintain?",
        cat: business.id,
        urgency: 5, importance: 5,
        status: "INBOX",
        estimate: 45,
        entities: [org.id],
        tags: [deep.id],
        minutes: 0,
      },
      {
        title: "Book a routine dental check-up",
        description: "Find a morning slot next week.",
        cat: health.id,
        urgency: 2, importance: 2,
        status: "INBOX",
        estimate: 10,
        entities: [],
        tags: [follow.id],
        minutes: 0,
      },
      {
        title: "Review the studio expense notes",
        description:
          "Carry forward from last week. No rush, but worth closing the loop.",
        cat: business.id,
        urgency: 5, importance: 5,
        status: "DEFERRED",
        estimate: 30,
        entities: [org.id],
        tags: [],
        minutes: 0,
      },
      {
        title: "Sketch the mobile navigation",
        description:
          "Test the smallest useful navigation before adding layers.",
        cat: design.id,
        urgency: 5, importance: 5,
        status: "COMPLETED",
        estimate: 60,
        entities: [project.id],
        tags: [deep.id],
        minutes: 50,
      },
    ] as const;
    for (let i = 0; i < items.length; i++) {
      const x = items[i];
      const completed = x.status === "COMPLETED";
      const date = i === 7 ? addDays(today, -2) : today;
      const created = new Date(addDays(today, -(i + 2)) + "T04:30:00Z");
      const t = await tx.task.create({
        data: {
          userId,
          title: x.title,
          description: x.description,
          primaryCategoryId: x.cat,
          urgency: x.urgency, importance: x.importance,
          status: x.status,
          estimatedMinutes: x.estimate,
          plannedDate: i < 4 || i === 7 ? asDate(date) : null,
          dueAt: i === 1 ? new Date(today + "T12:30:00Z") : null,
          completedAt: completed ? new Date(date + "T05:30:00Z") : null,
          createdAt: created,
        },
      });
      await tx.taskEvent.create({
        data: {
          userId,
          taskId: t.id,
          eventType: "CREATED",
          occurredAt: created,
          toValue: { title: t.title, status: "INBOX" },
        },
      });
      if (completed)
        await tx.taskEvent.create({
          data: {
            userId,
            taskId: t.id,
            eventType: "COMPLETED",
            occurredAt: new Date(date + "T05:30:00Z"),
            fromValue: { status: "PLANNED" },
            toValue: { status: "COMPLETED" },
          },
        });
      if (x.status === "DEFERRED")
        await tx.taskEvent.create({
          data: {
            userId,
            taskId: t.id,
            eventType: "DEFERRED",
            occurredAt: new Date(addDays(today, -1) + "T08:00:00Z"),
            toValue: { status: "DEFERRED" },
          },
        });
      for (const tagId of x.tags)
        await tx.taskTag.create({ data: { userId, taskId: t.id, tagId } });
      for (const entityId of x.entities)
        await tx.taskEntityLink.create({
          data: {
            userId,
            taskId: t.id,
            entityId,
            relationshipType: "CONTRIBUTES_TO",
          },
        });
      if (x.minutes)
        await tx.taskEffortEntry.create({
          data: {
            userId,
            taskId: t.id,
            occurredOn: asDate(date)!,
            minutes: x.minutes,
            note:
              i === 0
                ? "Explored the opening layout and type hierarchy."
                : "A good, focused session.",
          },
        });
      if (i < 4 || i === 6)
        await tx.taskPeriod.create({
          data: { userId, taskId: t.id, planningPeriodId: current.id },
        });
      if (i === 6)
        await tx.taskPeriod.create({
          data: { userId, taskId: t.id, planningPeriodId: previous.id },
        });
      if (i === 0)
        await tx.reminder.create({
          data: {
            userId,
            taskId: t.id,
            scheduledFor: new Date(Date.now() + 3600000),
          },
        });
    }
    const journal = await tx.journalEntry.create({
      data: {
        userId,
        title: "Less noise, more attention",
        content:
          "The homepage started making sense when I stopped adding sections and asked what someone actually needs to know first.\n\nA useful reminder for the rest of the day, too: make room before making more.",
        occurredAt: new Date(today + "T05:00:00Z"),
      },
    });
    await tx.journalCategoryLink.create({
      data: { userId, journalEntryId: journal.id, categoryId: design.id },
    });
    await tx.journalEntityLink.create({
      data: { userId, journalEntryId: journal.id, entityId: project.id },
    });
    await tx.journalEntry.create({
      data: {
        userId,
        title: "A small practice note",
        content:
          "Ten quiet minutes with the guitar felt better than trying to finish a whole exercise. The bends are more consistent when I slow down.",
        occurredAt: new Date(addDays(today, -1) + "T13:30:00Z"),
      },
    });
  },
  { timeout: 20000 },
);
console.log("Seeded a realistic workspace.");
await db.$disconnect();
