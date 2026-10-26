-- Durable retry protection. No existing application data is changed.
CREATE TABLE command_receipts (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key uuid NOT NULL,
  payload_hash text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);
CREATE INDEX command_receipts_created_idx ON command_receipts(created_at);
