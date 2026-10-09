CREATE TABLE IF NOT EXISTS checkout_idempotency (
  idempotency_key VARCHAR(128) PRIMARY KEY,
  request_fingerprint CHAR(64) NOT NULL,
  order_id INTEGER UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
