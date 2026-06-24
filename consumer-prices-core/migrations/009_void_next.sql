-- Schema for Void Next user state and payment logs
CREATE TABLE IF NOT EXISTS void_next_users (
  wallet_address      VARCHAR(64) PRIMARY KEY,
  username            VARCHAR(128),
  verification_level  VARCHAR(32),
  is_premium          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS void_next_payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address      VARCHAR(64) NOT NULL REFERENCES void_next_users(wallet_address) ON DELETE CASCADE,
  reference           VARCHAR(256) NOT NULL UNIQUE,
  amount              NUMERIC(12,4) NOT NULL,
  status              VARCHAR(32) NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
