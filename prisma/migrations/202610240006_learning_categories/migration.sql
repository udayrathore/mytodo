ALTER TABLE learnings ADD COLUMN category_id UUID;
ALTER TABLE learnings ADD CONSTRAINT learnings_category_owner_fk FOREIGN KEY(category_id,user_id) REFERENCES categories(id,user_id);
CREATE INDEX learnings_category_idx ON learnings(user_id,category_id);
