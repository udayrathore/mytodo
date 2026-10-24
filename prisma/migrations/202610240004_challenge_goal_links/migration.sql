ALTER TABLE challenges DROP COLUMN status, DROP COLUMN progress, DROP COLUMN estimated_minutes;
ALTER TABLE challenge_comments DROP COLUMN progress;
ALTER TABLE challenges ADD COLUMN goal_id UUID REFERENCES goals(id) ON DELETE SET NULL;
CREATE INDEX challenges_goal_idx ON challenges(user_id,goal_id);
