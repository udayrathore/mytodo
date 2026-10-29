-- Expand the repeat unit constraint; existing schedules and task records are preserved.
ALTER TABLE task_series DROP CONSTRAINT task_series_unit_check;
ALTER TABLE task_series ADD CONSTRAINT task_series_unit_check CHECK (unit IN ('DAY','WEEK','MONTH','WEEKDAY'));
