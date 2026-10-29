-- Checklist items belong only to their parent; existing task records are preserved.
CREATE TABLE task_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  parent_task_id uuid NOT NULL,
  title varchar(240) NOT NULL CHECK (length(btrim(title)) > 0),
  is_completed boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(3) NOT NULL,
  CONSTRAINT task_checklist_items_owner_parent_fkey FOREIGN KEY (parent_task_id, user_id)
    REFERENCES tasks(id, user_id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX task_checklist_items_owner_parent_idx ON task_checklist_items(user_id, parent_task_id, sort_order, id);
