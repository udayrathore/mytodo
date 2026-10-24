ALTER TABLE journal_entries ADD COLUMN document JSONB;
ALTER TABLE journal_entries ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
