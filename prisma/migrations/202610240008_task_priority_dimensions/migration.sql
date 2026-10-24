ALTER TABLE "tasks" ADD COLUMN "urgency" INTEGER NOT NULL DEFAULT 5, ADD COLUMN "importance" INTEGER NOT NULL DEFAULT 5;
UPDATE "tasks" SET "urgency" = CASE "priority"::text WHEN 'LOW' THEN 2 WHEN 'HIGH' THEN 8 ELSE 5 END, "importance" = CASE "priority"::text WHEN 'LOW' THEN 2 WHEN 'HIGH' THEN 8 ELSE 5 END;
UPDATE "task_series" SET "blueprint" = ("blueprint" - 'priority') || jsonb_build_object('urgency', CASE "blueprint"->>'priority' WHEN 'LOW' THEN 2 WHEN 'HIGH' THEN 8 ELSE 5 END, 'importance', CASE "blueprint"->>'priority' WHEN 'LOW' THEN 2 WHEN 'HIGH' THEN 8 ELSE 5 END);
ALTER TABLE "tasks" DROP COLUMN "priority", ADD CONSTRAINT "tasks_urgency_range" CHECK ("urgency" BETWEEN 0 AND 10), ADD CONSTRAINT "tasks_importance_range" CHECK ("importance" BETWEEN 0 AND 10);
DROP TYPE "Priority";
