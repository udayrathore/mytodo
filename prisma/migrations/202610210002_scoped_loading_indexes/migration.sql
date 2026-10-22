CREATE INDEX "tasks_owner_created_cursor_idx" ON "tasks" ("user_id", "created_at", "id");
CREATE INDEX "tasks_owner_series_date_idx" ON "tasks" ("user_id", "series_id", "planned_date", "id");
CREATE INDEX "events_owner_time_cursor_idx" ON "task_events" ("user_id", "occurred_at", "id");
CREATE INDEX "events_owner_task_time_idx" ON "task_events" ("user_id", "task_id", "occurred_at", "id");
CREATE INDEX "effort_owner_date_cursor_idx" ON "task_effort_entries" ("user_id", "occurred_on", "id");
CREATE INDEX "journal_owner_time_cursor_idx" ON "journal_entries" ("user_id", "occurred_at", "id");
