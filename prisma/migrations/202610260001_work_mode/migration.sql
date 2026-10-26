-- Work-mode preferences are additive; existing application records are preserved.
ALTER TABLE users ADD COLUMN work_mode_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN work_category_ids uuid[] NOT NULL DEFAULT '{}';
