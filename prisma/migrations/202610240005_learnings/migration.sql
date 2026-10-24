CREATE TABLE learnings (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id), title VARCHAR(240) NOT NULL,
 content TEXT NOT NULL DEFAULT '', document JSONB NOT NULL, core_finding TEXT NOT NULL DEFAULT '',
 version INTEGER NOT NULL DEFAULT 0, archived_at TIMESTAMPTZ(3),
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ(3) NOT NULL,
 UNIQUE(id,user_id)
);
CREATE INDEX learnings_owner_updated ON learnings(user_id,updated_at);
CREATE TABLE learning_updates (
 id UUID PRIMARY KEY, user_id UUID NOT NULL, learning_id UUID NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('FINDING','BELIEF')), body TEXT NOT NULL,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
 FOREIGN KEY(learning_id,user_id) REFERENCES learnings(id,user_id) ON DELETE CASCADE
);
CREATE INDEX learning_updates_history ON learning_updates(user_id,learning_id,created_at);
