CREATE TABLE "task_comments" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "task_id" UUID NOT NULL,
  "body" TEXT NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 5000),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "task_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "task_comments_task_id_user_id_fkey" FOREIGN KEY ("task_id", "user_id") REFERENCES "tasks"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "task_comments_user_id_task_id_created_at_id_idx" ON "task_comments"("user_id", "task_id", "created_at", "id");
