ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence JSONB;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_source_id TEXT;

CREATE INDEX IF NOT EXISTS tasks_recurrence_source_idx
  ON tasks(user_id, recurrence_source_id)
  WHERE recurrence_source_id IS NOT NULL;
