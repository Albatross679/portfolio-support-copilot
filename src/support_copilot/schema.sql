CREATE EXTENSION IF NOT EXISTS vector;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'support_copilot_reader') THEN
    CREATE ROLE support_copilot_reader NOLOGIN;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS customers (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('Blu-ray', 'DVD', '4K UHD', 'box set')),
  sku TEXT NOT NULL UNIQUE,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0)
);

CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  customer_id BIGINT NOT NULL REFERENCES customers(id),
  product_id BIGINT NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  ordered_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'delivered',
  refund_status TEXT NOT NULL DEFAULT 'none' CHECK (refund_status IN ('none', 'approved', 'rejected'))
);

CREATE TABLE IF NOT EXISTS help_document_embeddings (
  id BIGSERIAL PRIMARY KEY,
  document_name TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  embedding vector({{EMBEDDING_DIM}}) NOT NULL,
  document_fingerprint TEXT NOT NULL,
  UNIQUE (document_name, chunk_index)
);

REVOKE ALL ON customers, products, orders FROM support_copilot_reader;
GRANT SELECT ON customers, products, orders TO support_copilot_reader;
GRANT support_copilot_reader TO CURRENT_USER;
