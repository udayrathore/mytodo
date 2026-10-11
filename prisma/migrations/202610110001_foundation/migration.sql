-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('INBOX', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'DEFERRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('CREATED', 'UPDATED', 'STATUS_CHANGED', 'PLANNED', 'RESCHEDULED', 'DEFERRED', 'COMPLETED', 'REOPENED', 'CANCELLED', 'ARCHIVED', 'CATEGORY_CHANGED', 'EFFORT_RECORDED', 'FIELDS_UPDATED', 'RELATION_ADDED');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('PERSON', 'ORGANIZATION', 'CLIENT', 'PROJECT', 'OTHER');

-- CreateEnum
CREATE TYPE "PeriodType" AS ENUM ('DAY', 'WEEK', 'MONTH', 'QUARTER', 'SPRINT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "FieldType" AS ENUM ('TEXT', 'LONG_TEXT', 'NUMBER', 'BOOLEAN', 'DATE', 'DATETIME', 'SELECT', 'MULTI_SELECT');

-- CreateEnum
CREATE TYPE "RelationType" AS ENUM ('DEPENDS_ON', 'BLOCKS', 'RELATED_TO', 'FOLLOW_UP_TO', 'SUBTASK_OF');

-- CreateEnum
CREATE TYPE "ReminderChannel" AS ENUM ('IN_APP', 'EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('DELIVERED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "slug" TEXT NOT NULL,
    "parent_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "description" TEXT,
    "primary_category_id" UUID,
    "template_id" UUID,
    "status" "TaskStatus" NOT NULL DEFAULT 'INBOX',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "planned_date" DATE,
    "due_at" TIMESTAMPTZ(3),
    "estimated_minutes" INTEGER,
    "manual_actual_minutes" INTEGER,
    "completed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "archived_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_events" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "event_type" "EventType" NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "from_value" JSONB,
    "to_value" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "task_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_tags" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "task_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "EntityType" NOT NULL,
    "description" TEXT,
    "parent_entity_id" UUID,
    "metadata" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_entity_links" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "relationship_type" TEXT NOT NULL DEFAULT 'RELATED_TO',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "task_entity_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_periods" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "PeriodType" NOT NULL DEFAULT 'WEEK',
    "title" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "planning_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_periods" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "planning_period_id" UUID NOT NULL,
    "planned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "task_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_templates" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "task_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_template_fields" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "field_type" "FieldType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "configuration" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "task_template_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_field_values" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "template_field_id" UUID NOT NULL,
    "text_value" TEXT,
    "number_value" DECIMAL(18,4),
    "boolean_value" BOOLEAN,
    "date_value" DATE,
    "datetime_value" TIMESTAMPTZ(3),
    "json_value" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "task_field_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_effort_entries" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "occurred_on" DATE NOT NULL,
    "minutes" INTEGER NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "task_effort_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_relations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "source_task_id" UUID NOT NULL,
    "target_task_id" UUID NOT NULL,
    "relation_type" "RelationType" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "task_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_category_links" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "journal_entry_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "journal_category_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entity_links" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "journal_entry_id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "relationship_type" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "journal_entity_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "task_id" UUID,
    "journal_entry_id" UUID,
    "scheduled_for" TIMESTAMPTZ(3) NOT NULL,
    "channel" "ReminderChannel" NOT NULL DEFAULT 'IN_APP',
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "cancelled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder_deliveries" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "reminder_id" UUID NOT NULL,
    "attempted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "DeliveryStatus" NOT NULL,
    "provider" TEXT,
    "external_id" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reminder_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_buckets" (
    "key" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "resets_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "login_buckets_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "categories_user_id_parent_id_sort_order_idx" ON "categories"("user_id", "parent_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "categories_user_id_slug_key" ON "categories"("user_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "categories_id_user_id_key" ON "categories"("id", "user_id");

-- CreateIndex
CREATE INDEX "tasks_user_id_archived_at_status_planned_date_idx" ON "tasks"("user_id", "archived_at", "status", "planned_date");

-- CreateIndex
CREATE INDEX "tasks_user_id_due_at_idx" ON "tasks"("user_id", "due_at");

-- CreateIndex
CREATE INDEX "tasks_user_id_primary_category_id_idx" ON "tasks"("user_id", "primary_category_id");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_id_user_id_key" ON "tasks"("id", "user_id");

-- CreateIndex
CREATE INDEX "task_events_user_id_occurred_at_idx" ON "task_events"("user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "task_events_task_id_occurred_at_idx" ON "task_events"("task_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "task_events_id_user_id_key" ON "task_events"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "tags_user_id_slug_key" ON "tags"("user_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "tags_id_user_id_key" ON "tags"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_tags_task_id_tag_id_key" ON "task_tags"("task_id", "tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_tags_id_user_id_key" ON "task_tags"("id", "user_id");

-- CreateIndex
CREATE INDEX "entities_user_id_parent_entity_id_idx" ON "entities"("user_id", "parent_entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "entities_user_id_name_type_key" ON "entities"("user_id", "name", "type");

-- CreateIndex
CREATE UNIQUE INDEX "entities_id_user_id_key" ON "entities"("id", "user_id");

-- CreateIndex
CREATE INDEX "task_entity_links_user_id_entity_id_idx" ON "task_entity_links"("user_id", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_entity_links_task_id_entity_id_relationship_type_key" ON "task_entity_links"("task_id", "entity_id", "relationship_type");

-- CreateIndex
CREATE UNIQUE INDEX "task_entity_links_id_user_id_key" ON "task_entity_links"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "planning_periods_user_id_type_starts_on_ends_on_key" ON "planning_periods"("user_id", "type", "starts_on", "ends_on");

-- CreateIndex
CREATE UNIQUE INDEX "planning_periods_id_user_id_key" ON "planning_periods"("id", "user_id");

-- CreateIndex
CREATE INDEX "task_periods_user_id_planning_period_id_removed_at_idx" ON "task_periods"("user_id", "planning_period_id", "removed_at");

-- CreateIndex
CREATE UNIQUE INDEX "task_periods_id_user_id_key" ON "task_periods"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_templates_user_id_name_revision_key" ON "task_templates"("user_id", "name", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "task_templates_id_user_id_key" ON "task_templates"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_template_fields_template_id_key_key" ON "task_template_fields"("template_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "task_template_fields_id_user_id_key" ON "task_template_fields"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_field_values_task_id_template_field_id_key" ON "task_field_values"("task_id", "template_field_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_field_values_id_user_id_key" ON "task_field_values"("id", "user_id");

-- CreateIndex
CREATE INDEX "task_effort_entries_user_id_occurred_on_idx" ON "task_effort_entries"("user_id", "occurred_on");

-- CreateIndex
CREATE INDEX "task_effort_entries_task_id_idx" ON "task_effort_entries"("task_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_effort_entries_id_user_id_key" ON "task_effort_entries"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_relations_source_task_id_target_task_id_relation_type_key" ON "task_relations"("source_task_id", "target_task_id", "relation_type");

-- CreateIndex
CREATE UNIQUE INDEX "task_relations_id_user_id_key" ON "task_relations"("id", "user_id");

-- CreateIndex
CREATE INDEX "journal_entries_user_id_occurred_at_idx" ON "journal_entries"("user_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_id_user_id_key" ON "journal_entries"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "journal_category_links_journal_entry_id_category_id_key" ON "journal_category_links"("journal_entry_id", "category_id");

-- CreateIndex
CREATE UNIQUE INDEX "journal_category_links_id_user_id_key" ON "journal_category_links"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entity_links_journal_entry_id_entity_id_key" ON "journal_entity_links"("journal_entry_id", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entity_links_id_user_id_key" ON "journal_entity_links"("id", "user_id");

-- CreateIndex
CREATE INDEX "reminders_user_id_status_scheduled_for_idx" ON "reminders"("user_id", "status", "scheduled_for");

-- CreateIndex
CREATE UNIQUE INDEX "reminders_id_user_id_key" ON "reminders"("id", "user_id");

-- CreateIndex
CREATE INDEX "reminder_deliveries_reminder_id_attempted_at_idx" ON "reminder_deliveries"("reminder_id", "attempted_at");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_deliveries_id_user_id_key" ON "reminder_deliveries"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_id_user_id_key" ON "sessions"("id", "user_id");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_primary_category_id_fkey" FOREIGN KEY ("primary_category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "task_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entities" ADD CONSTRAINT "entities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entities" ADD CONSTRAINT "entities_parent_entity_id_fkey" FOREIGN KEY ("parent_entity_id") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_entity_links" ADD CONSTRAINT "task_entity_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_entity_links" ADD CONSTRAINT "task_entity_links_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_entity_links" ADD CONSTRAINT "task_entity_links_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_periods" ADD CONSTRAINT "planning_periods_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_periods" ADD CONSTRAINT "task_periods_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_periods" ADD CONSTRAINT "task_periods_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_periods" ADD CONSTRAINT "task_periods_planning_period_id_fkey" FOREIGN KEY ("planning_period_id") REFERENCES "planning_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_template_fields" ADD CONSTRAINT "task_template_fields_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_template_fields" ADD CONSTRAINT "task_template_fields_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "task_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_field_values" ADD CONSTRAINT "task_field_values_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_field_values" ADD CONSTRAINT "task_field_values_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_field_values" ADD CONSTRAINT "task_field_values_template_field_id_fkey" FOREIGN KEY ("template_field_id") REFERENCES "task_template_fields"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_effort_entries" ADD CONSTRAINT "task_effort_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_effort_entries" ADD CONSTRAINT "task_effort_entries_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_relations" ADD CONSTRAINT "task_relations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_relations" ADD CONSTRAINT "task_relations_source_task_id_fkey" FOREIGN KEY ("source_task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_relations" ADD CONSTRAINT "task_relations_target_task_id_fkey" FOREIGN KEY ("target_task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_category_links" ADD CONSTRAINT "journal_category_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_category_links" ADD CONSTRAINT "journal_category_links_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_category_links" ADD CONSTRAINT "journal_category_links_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entity_links" ADD CONSTRAINT "journal_entity_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entity_links" ADD CONSTRAINT "journal_entity_links_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entity_links" ADD CONSTRAINT "journal_entity_links_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_deliveries" ADD CONSTRAINT "reminder_deliveries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_deliveries" ADD CONSTRAINT "reminder_deliveries_reminder_id_fkey" FOREIGN KEY ("reminder_id") REFERENCES "reminders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Owner isolation on every relation, including join tables.
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_owner_fk" FOREIGN KEY ("parent_id", "user_id") REFERENCES "categories" ("id", "user_id") ON DELETE RESTRICT;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_primary_category_id_owner_fk" FOREIGN KEY ("primary_category_id", "user_id") REFERENCES "categories" ("id", "user_id") ON DELETE RESTRICT;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_template_id_owner_fk" FOREIGN KEY ("template_id", "user_id") REFERENCES "task_templates" ("id", "user_id") ON DELETE RESTRICT;
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_task_id_owner_fk" FOREIGN KEY ("task_id", "user_id") REFERENCES "tasks" ("id", "user_id") ON DELETE RESTRICT;
ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_task_id_owner_fk" FOREIGN KEY ("task_id", "user_id") REFERENCES "tasks" ("id", "user_id") ON DELETE RESTRICT;
ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_tag_id_owner_fk" FOREIGN KEY ("tag_id", "user_id") REFERENCES "tags" ("id", "user_id") ON DELETE RESTRICT;
ALTER TABLE "entities" ADD CONSTRAINT "entities_parent_entity_id_owner_fk" FOREIGN KEY ("parent_entity_id", "user_id") REFERENCES "entities" ("id", "user_id") ON DELETE RESTRICT;
ALTER TABLE "task_entity_links" ADD CONSTRAINT "task_entity_links_task_id_owner_fk" FOREIGN KEY ("task_id", "user_id") REFERENCES "tasks" ("id", "user_id") ON DELETE RESTRICT;
ALTER TABLE "task_entity_links" ADD CONSTRAINT "task_entity_links_entity_id_owner_fk" FOREIGN KEY ("entity_id", "user_id") REFERENCES "entities" ("id", "user_id") ON DELETE RESTRICT;
ALTER TABLE "task_periods" ADD CONSTRAINT "task_periods_task_id_owner_fk" FOREIGN KEY ("task_id", "user_id") REFERENCES "tasks" ("id", "user_id") ON DELETE RESTRICT;
ALTER TABLE "task_periods" ADD CONSTRAINT "task_periods_planning_period_id_owner_fk" FOREIGN KEY ("planning_period_id", "user_id") REFERENCES "planning_periods" ("id", "user_id") ON DELETE RESTRICT;
ALTER TABLE "task_template_fields" ADD CONSTRAINT "task_template_fields_template_id_owner_fk" FOREIGN KEY ("template_id", "user_id") REFERENCES "task_templates" ("id", "user_id") ON DELETE RESTRICT;
ALTER TABLE "task_field_values" ADD CONSTRAINT "task_field_values_task_id_owner_fk" FOREIGN KEY ("task_id", "user_id") REFERENCES "tasks" ("id", "user_id") ON DELETE RESTRICT;
ALTER TABLE "task_field_values" ADD CONSTRAINT "task_field_values_template_field_id_owner_fk" FOREIGN KEY ("template_field_id", "user_id") REFERENCES "task_template_fields" ("id", "user_id") ON DELETE RESTRICT;
ALTER TABLE "task_effort_entries" ADD CONSTRAINT "task_effort_entries_task_id_owner_fk" FOREIGN KEY ("task_id", "user_id") REFERENCES "tasks" ("id", "user_id") ON DELETE RESTRICT;
ALTER TABLE "task_relations" ADD CONSTRAINT "task_relations_source_task_id_owner_fk" FOREIGN KEY ("source_task_id", "user_id") REFERENCES "tasks" ("id", "user_id") ON DELETE RESTRICT;
ALTER TABLE "task_relations" ADD CONSTRAINT "task_relations_target_task_id_owner_fk" FOREIGN KEY ("target_task_id", "user_id") REFERENCES "tasks" ("id", "user_id") ON DELETE RESTRICT;
ALTER TABLE "journal_category_links" ADD CONSTRAINT "journal_category_links_journal_entry_id_owner_fk" FOREIGN KEY ("journal_entry_id", "user_id") REFERENCES "journal_entries" ("id", "user_id") ON DELETE RESTRICT;
ALTER TABLE "journal_category_links" ADD CONSTRAINT "journal_category_links_category_id_owner_fk" FOREIGN KEY ("category_id", "user_id") REFERENCES "categories" ("id", "user_id") ON DELETE RESTRICT;
ALTER TABLE "journal_entity_links" ADD CONSTRAINT "journal_entity_links_journal_entry_id_owner_fk" FOREIGN KEY ("journal_entry_id", "user_id") REFERENCES "journal_entries" ("id", "user_id") ON DELETE RESTRICT;
ALTER TABLE "journal_entity_links" ADD CONSTRAINT "journal_entity_links_entity_id_owner_fk" FOREIGN KEY ("entity_id", "user_id") REFERENCES "entities" ("id", "user_id") ON DELETE RESTRICT;
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_task_id_owner_fk" FOREIGN KEY ("task_id", "user_id") REFERENCES "tasks" ("id", "user_id") ON DELETE RESTRICT;
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_journal_entry_id_owner_fk" FOREIGN KEY ("journal_entry_id", "user_id") REFERENCES "journal_entries" ("id", "user_id") ON DELETE RESTRICT;
ALTER TABLE "reminder_deliveries" ADD CONSTRAINT "reminder_deliveries_reminder_id_owner_fk" FOREIGN KEY ("reminder_id", "user_id") REFERENCES "reminders" ("id", "user_id") ON DELETE RESTRICT;

-- Domain integrity not expressible in Prisma's schema language.
ALTER TABLE tasks ADD CONSTRAINT tasks_minutes_nonnegative CHECK ((estimated_minutes IS NULL OR estimated_minutes >= 0) AND (manual_actual_minutes IS NULL OR manual_actual_minutes >= 0));
ALTER TABLE tasks ADD CONSTRAINT tasks_completion_consistent CHECK ((status = 'COMPLETED') = (completed_at IS NOT NULL));
ALTER TABLE tasks ADD CONSTRAINT tasks_cancellation_consistent CHECK ((status = 'CANCELLED') = (cancelled_at IS NOT NULL));
ALTER TABLE task_effort_entries ADD CONSTRAINT effort_positive CHECK (minutes BETWEEN 1 AND 1440);
ALTER TABLE planning_periods ADD CONSTRAINT period_dates CHECK (starts_on <= ends_on);
ALTER TABLE task_relations ADD CONSTRAINT no_self_relation CHECK (source_task_id <> target_task_id);
ALTER TABLE reminders ADD CONSTRAINT reminder_one_subject CHECK (num_nonnulls(task_id,journal_entry_id) = 1);
ALTER TABLE task_field_values ADD CONSTRAINT field_single_storage CHECK (num_nonnulls(text_value,number_value,boolean_value,date_value,datetime_value,json_value) <= 1);
CREATE UNIQUE INDEX task_periods_active_assignment ON task_periods(task_id,planning_period_id) WHERE removed_at IS NULL;
CREATE INDEX task_search_idx ON tasks USING gin (to_tsvector('simple',title || ' ' || coalesce(description,'')));
CREATE INDEX journal_search_idx ON journal_entries USING gin (to_tsvector('simple',coalesce(title,'') || ' ' || content));

CREATE FUNCTION check_category_cycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text,0));
  IF NEW.parent_id IS NOT NULL AND EXISTS (
    WITH RECURSIVE ancestors AS (
      SELECT id,parent_id FROM categories WHERE id=NEW.parent_id
      UNION SELECT c.id,c.parent_id FROM categories c JOIN ancestors a ON c.id=a.parent_id
    ) SELECT 1 FROM ancestors WHERE id=NEW.id
  ) THEN RAISE EXCEPTION 'Category ancestry cannot contain a cycle'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER category_cycle BEFORE INSERT OR UPDATE OF parent_id ON categories FOR EACH ROW EXECUTE FUNCTION check_category_cycle();
CREATE FUNCTION check_entity_cycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text,0));
  IF NEW.parent_entity_id IS NOT NULL AND EXISTS (
    WITH RECURSIVE ancestors AS (
      SELECT id,parent_entity_id FROM entities WHERE id=NEW.parent_entity_id
      UNION SELECT e.id,e.parent_entity_id FROM entities e JOIN ancestors a ON e.id=a.parent_entity_id
    ) SELECT 1 FROM ancestors WHERE id=NEW.id
  ) THEN RAISE EXCEPTION 'Entity ancestry cannot contain a cycle'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER entity_cycle BEFORE INSERT OR UPDATE OF parent_entity_id ON entities FOR EACH ROW EXECUTE FUNCTION check_entity_cycle();
CREATE FUNCTION check_field_value() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE f task_template_fields; template uuid;
BEGIN
 SELECT * INTO f FROM task_template_fields WHERE id=NEW.template_field_id;
 SELECT template_id INTO template FROM tasks WHERE id=NEW.task_id;
 IF template IS DISTINCT FROM f.template_id THEN RAISE EXCEPTION 'Field does not belong to task template'; END IF;
 IF (NEW.text_value IS NOT NULL AND f.field_type NOT IN ('TEXT','LONG_TEXT','SELECT'))
 OR (NEW.number_value IS NOT NULL AND f.field_type <> 'NUMBER')
 OR (NEW.boolean_value IS NOT NULL AND f.field_type <> 'BOOLEAN')
 OR (NEW.date_value IS NOT NULL AND f.field_type <> 'DATE')
 OR (NEW.datetime_value IS NOT NULL AND f.field_type <> 'DATETIME')
 OR (NEW.json_value IS NOT NULL AND f.field_type <> 'MULTI_SELECT') THEN RAISE EXCEPTION 'Custom field storage type mismatch'; END IF;
 IF f.field_type='SELECT' AND NEW.text_value IS NOT NULL AND NOT (f.configuration->'options' ? NEW.text_value) THEN RAISE EXCEPTION 'Invalid select option'; END IF;
 IF f.field_type='MULTI_SELECT' AND NEW.json_value IS NOT NULL THEN
   IF jsonb_typeof(NEW.json_value)<>'array' THEN RAISE EXCEPTION 'Expected options array'; END IF;
   IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(NEW.json_value) v WHERE NOT(f.configuration->'options' ? v)) THEN RAISE EXCEPTION 'Invalid multi-select option'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_field_value BEFORE INSERT OR UPDATE ON task_field_values FOR EACH ROW EXECUTE FUNCTION check_field_value();
CREATE FUNCTION protect_used_field() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM tasks WHERE template_id=OLD.template_id) THEN RAISE EXCEPTION 'Create a template revision to preserve historical fields'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_used_field BEFORE UPDATE ON task_template_fields FOR EACH ROW EXECUTE FUNCTION protect_used_field();
CREATE FUNCTION immutable_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Task events are append-only'; END $$;
CREATE TRIGGER preserve_events BEFORE UPDATE OR DELETE ON task_events FOR EACH ROW EXECUTE FUNCTION immutable_event();
