import { test, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
// Execute the exact migration against isolated PostgreSQL WASM, avoiding socket
// transport error-recovery differences. No app DB or user data is touched.
const db = await PGlite.create();
for (const name of readdirSync("prisma/migrations")
  .filter((n) => /^\d/.test(n))
  .sort())
  await db.exec(
    readFileSync(`prisma/migrations/${name}/migration.sql`, "utf8"),
  );
const owner = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002",
  task = "00000000-0000-4000-8000-000000000003";
await db.query(
  "INSERT INTO users(id,email,name,updated_at) VALUES($1,'owner@test.local','Owner',now()),($2,'other@test.local','Other',now())",
  [owner, other],
);
await db.query(
  "INSERT INTO tasks(id,user_id,title,updated_at) VALUES($1,$2,'Task',now())",
  [task, owner],
);
after(() => db.close());
test("migration rejects cross-owner references and cyclic ancestry", async () => {
  const root = "00000000-0000-4000-8000-000000000004",
    child = "00000000-0000-4000-8000-000000000005";
  await db.query(
    "INSERT INTO categories(id,user_id,name,slug,updated_at) VALUES($1,$2,'Root','root',now())",
    [root, owner],
  );
  await db.query(
    "INSERT INTO categories(id,user_id,name,slug,parent_id,updated_at) VALUES($1,$2,'Child','child',$3,now())",
    [child, owner, root],
  );
  await assert.rejects(
    db.query("UPDATE categories SET parent_id=$1 WHERE id=$2", [child, root]),
    /cycle/,
  );
  await assert.rejects(
    db.query("UPDATE tasks SET user_id=$1,primary_category_id=$2 WHERE id=$3", [
      other,
      root,
      task,
    ]),
    /foreign key/,
  );
});
test("migration rejects invalid effort, self relations, incomplete status and ambiguous reminder subjects", async () => {
  await assert.rejects(
    db.query(
      "INSERT INTO task_effort_entries(id,user_id,task_id,occurred_on,minutes,updated_at) VALUES(gen_random_uuid(),$1,$2,current_date,-1,now())",
      [owner, task],
    ),
    /check constraint/,
  );
  await assert.rejects(
    db.query("UPDATE tasks SET status='COMPLETED' WHERE id=$1", [task]),
    /check constraint/,
  );
  await assert.rejects(
    db.query(
      "INSERT INTO task_relations(id,user_id,source_task_id,target_task_id,relation_type,updated_at) VALUES(gen_random_uuid(),$1,$2,$2,'RELATED_TO',now())",
      [owner, task],
    ),
    /check constraint/,
  );
  await assert.rejects(
    db.query(
      "INSERT INTO reminders(id,user_id,scheduled_for,updated_at) VALUES(gen_random_uuid(),$1,now(),now())",
      [owner],
    ),
    /check constraint/,
  );
});
test("event history is append-only", async () => {
  await db.query(
    "INSERT INTO task_events(id,user_id,task_id,event_type,updated_at) VALUES(gen_random_uuid(),$1,$2,'CREATED',now())",
    [owner, task],
  );
  await assert.rejects(
    db.query("DELETE FROM task_events WHERE task_id=$1", [task]),
    /append-only/,
  );
  await assert.rejects(
    db.query("UPDATE task_events SET event_type='UPDATED' WHERE task_id=$1", [
      task,
    ]),
    /append-only/,
  );
});
test("custom fields enforce template membership, storage type, and immutable historical definitions", async () => {
  const task = "00000000-0000-4000-8000-000000000008";
  const template = "00000000-0000-4000-8000-000000000006",
    field = "00000000-0000-4000-8000-000000000007";
  await db.query(
    "INSERT INTO task_templates(id,user_id,name,updated_at) VALUES($1,$2,'Template',now())",
    [template, owner],
  );
  await db.query(
    "INSERT INTO task_template_fields(id,user_id,template_id,key,label,field_type,updated_at) VALUES($1,$2,$3,'count','Count','NUMBER',now())",
    [field, owner, template],
  );
  await db.query(
    "INSERT INTO tasks(id,user_id,title,template_id,updated_at) VALUES($1,$2,'Field task',$3,now())",
    [task, owner, template],
  );
  await assert.rejects(
    db.query(
      "INSERT INTO task_field_values(id,user_id,task_id,template_field_id,number_value,updated_at) VALUES(gen_random_uuid(),$1,$2,$3,0,now())",
      [owner, "00000000-0000-4000-8000-000000000003", field],
    ),
    /does not belong/,
  );
  await assert.rejects(
    db.query("UPDATE tasks SET template_id=NULL WHERE id=$1", [task]),
    /fixed at capture/,
  );
  await assert.rejects(
    db.query(
      "INSERT INTO task_field_values(id,user_id,task_id,template_field_id,text_value,updated_at) VALUES(gen_random_uuid(),$1,$2,$3,'wrong',now())",
      [owner, task, field],
    ),
    /storage type/,
  );
  await db.query(
    "INSERT INTO task_field_values(id,user_id,task_id,template_field_id,number_value,updated_at) VALUES(gen_random_uuid(),$1,$2,$3,0,now())",
    [owner, task, field],
  );
  await assert.rejects(
    db.query("UPDATE task_template_fields SET field_type='TEXT' WHERE id=$1", [
      field,
    ]),
    /revision/,
  );
});

test("recurrence enforces owner boundaries, one occurrence per date, and valid priority scores", async () => {
  const series = "00000000-0000-4000-8000-000000000101";
  await db.query(
    "INSERT INTO task_series(id,user_id,unit,interval,starts_on,blueprint,updated_at) VALUES($1,$2,'DAY',1,'2026-10-20','{}',now())",
    [series, owner],
  );
  await assert.rejects(
    db.query(
      "UPDATE tasks SET series_id=$1,recurrence_date='2026-10-20',user_id=$2 WHERE id=$3",
      [series, other, task],
    ),
    /foreign key/,
  );
  await db.query(
    "UPDATE tasks SET series_id=$1,recurrence_date='2026-10-20' WHERE id=$2",
    [series, task],
  );
  await assert.rejects(
    db.query(
      "INSERT INTO tasks(id,user_id,title,series_id,recurrence_date,updated_at) VALUES('00000000-0000-4000-8000-000000000102',$1,'Duplicate',$2,'2026-10-20',now())",
      [owner, series],
    ),
    /unique/,
  );
  await assert.rejects(
    db.query("UPDATE tasks SET urgency=11 WHERE id=$1", [task]),
    /check constraint/,
  );
});
