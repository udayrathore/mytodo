CREATE TABLE goals (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id), category_id UUID NOT NULL,
 parent_id UUID, title VARCHAR(240) NOT NULL, reason TEXT NOT NULL CHECK(length(trim(reason)) > 0),
 status TEXT NOT NULL DEFAULT 'NOT_STARTED' CHECK(status IN ('NOT_STARTED','STARTED','COMPLETED')),
 progress INTEGER NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
 estimated_minutes INTEGER CHECK(estimated_minutes > 0), sort_order INTEGER NOT NULL DEFAULT 0,
 version INTEGER NOT NULL DEFAULT 0, archived_at TIMESTAMPTZ(3), created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ(3) NOT NULL,
 UNIQUE(id,user_id), FOREIGN KEY(category_id,user_id) REFERENCES categories(id,user_id),
 FOREIGN KEY(parent_id,user_id) REFERENCES goals(id,user_id) ON DELETE CASCADE, CHECK(parent_id IS DISTINCT FROM id)
);
CREATE INDEX goals_scope_order ON goals(user_id,category_id,parent_id,sort_order);
CREATE TABLE goal_comments (
 id UUID PRIMARY KEY, user_id UUID NOT NULL, goal_id UUID NOT NULL, body TEXT NOT NULL,
 progress INTEGER CHECK(progress BETWEEN 0 AND 100), created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
 FOREIGN KEY(goal_id,user_id) REFERENCES goals(id,user_id) ON DELETE CASCADE
);
CREATE INDEX goal_comments_history ON goal_comments(user_id,goal_id,created_at);
CREATE TABLE goal_tasks (
 goal_id UUID NOT NULL, task_id UUID NOT NULL, user_id UUID NOT NULL, PRIMARY KEY(goal_id,task_id),
 FOREIGN KEY(goal_id,user_id) REFERENCES goals(id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(task_id,user_id) REFERENCES tasks(id,user_id) ON DELETE CASCADE
);
CREATE INDEX goal_tasks_task ON goal_tasks(user_id,task_id);
