ALTER TABLE tasks DROP COLUMN is_micro, DROP COLUMN color, DROP COLUMN icon;
UPDATE task_series SET blueprint = blueprint - 'isMicro' - 'color' - 'icon';
