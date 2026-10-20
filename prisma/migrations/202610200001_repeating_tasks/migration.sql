CREATE TABLE task_series (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 unit varchar(10) NOT NULL CHECK (unit IN ('DAY','WEEK','MONTH')),
 interval integer NOT NULL DEFAULT 1 CHECK (interval BETWEEN 1 AND 365),
 starts_on date NOT NULL, ends_on date,
 active boolean NOT NULL DEFAULT true, blueprint jsonb NOT NULL,
 generated_through date, version integer NOT NULL DEFAULT 0,
 created_at timestamptz(3) NOT NULL DEFAULT now(), updated_at timestamptz(3) NOT NULL,
 UNIQUE(id,user_id), CHECK (ends_on IS NULL OR ends_on >= starts_on)
);
CREATE INDEX task_series_user_id_active_idx ON task_series(user_id,active);
ALTER TABLE tasks ADD COLUMN series_id uuid REFERENCES task_series(id) ON DELETE RESTRICT,
 ADD COLUMN recurrence_date date, ADD COLUMN is_exception boolean NOT NULL DEFAULT false,
 ADD COLUMN schedule_removed boolean NOT NULL DEFAULT false,
 ADD COLUMN color varchar(20) NOT NULL DEFAULT 'sage', ADD COLUMN icon varchar(30) NOT NULL DEFAULT 'none',
 ADD CONSTRAINT tasks_series_owner_fk FOREIGN KEY (series_id,user_id) REFERENCES task_series(id,user_id) ON DELETE RESTRICT,
 ADD CONSTRAINT tasks_series_date_check CHECK ((series_id IS NULL) = (recurrence_date IS NULL)),
 ADD CONSTRAINT tasks_series_date_unique UNIQUE(series_id,recurrence_date),
 ADD CONSTRAINT tasks_color_check CHECK (color IN ('sage','blue','purple','rose','amber','slate')),
 ADD CONSTRAINT tasks_icon_check CHECK (icon IN ('none','check','star','heart','home','briefcase','book','fitness','wallet','coffee','music','leaf','target'));
CREATE INDEX tasks_user_id_series_id_idx ON tasks(user_id,series_id);
