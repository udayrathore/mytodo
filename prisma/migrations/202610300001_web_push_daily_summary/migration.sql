-- Additive only: preserve every existing application table and row.
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint_hash VARCHAR(64) NOT NULL UNIQUE,
  endpoint VARCHAR(2048) NOT NULL,
  p256dh VARCHAR(128) NOT NULL,
  auth VARCHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ(3), disabled_at TIMESTAMPTZ(3),
  last_success_at TIMESTAMPTZ(3), last_error_at TIMESTAMPTZ(3), last_error_code INTEGER, last_test_at TIMESTAMPTZ(3),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(id,user_id)
);
CREATE INDEX push_subscriptions_user_id_disabled_at_idx ON push_subscriptions(user_id,disabled_at);
CREATE TABLE push_summary_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL,
  local_date DATE NOT NULL,
  slot VARCHAR(16) NOT NULL CHECK(slot IN ('morning','evening')),
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SENDING','SENT','FAILED','EXPIRED')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),
  lease_token UUID, lease_until TIMESTAMPTZ(3),
  next_attempt_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ(3) NOT NULL, sent_at TIMESTAMPTZ(3),
  completed_count INTEGER CHECK(completed_count>=0), pending_count INTEGER CHECK(pending_count>=0), last_error_code INTEGER,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(subscription_id,user_id) REFERENCES push_subscriptions(id,user_id) ON DELETE CASCADE,
  UNIQUE(subscription_id,local_date,slot)
);
CREATE INDEX push_summary_deliveries_status_next_attempt_at_idx ON push_summary_deliveries(status,next_attempt_at);
CREATE INDEX push_summary_deliveries_user_id_local_date_idx ON push_summary_deliveries(user_id,local_date);
