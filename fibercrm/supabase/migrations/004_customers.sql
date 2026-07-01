-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 004: Customers
-- Central anchor table — everything links back here.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE customer_type   AS ENUM ('home', 'business', 'estate');
CREATE TYPE customer_status AS ENUM ('active', 'suspended', 'churned');

CREATE TABLE customers (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         VARCHAR(120)    NOT NULL,
  email        VARCHAR(255),
  phone        VARCHAR(20)     NOT NULL,
  type         customer_type   NOT NULL DEFAULT 'home',
  status       customer_status NOT NULL DEFAULT 'active',
  address_id   UUID            REFERENCES addresses(id) ON DELETE SET NULL,
  -- Optional link to auth user (for portal login)
  user_id      UUID            REFERENCES users(id) ON DELETE SET NULL,
  id_number    VARCHAR(30),
  notes        TEXT,
  created_at   TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_customers_status  ON customers (status);
CREATE INDEX idx_customers_type    ON customers (type);
CREATE INDEX idx_customers_phone   ON customers (phone);
CREATE INDEX idx_customers_email   ON customers (email) WHERE email IS NOT NULL;
CREATE INDEX idx_customers_user_id ON customers (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_customers_address ON customers (address_id);

-- Full-text search on name + email + phone
CREATE INDEX idx_customers_search ON customers
  USING gin(to_tsvector('english', name || ' ' || COALESCE(email,'') || ' ' || phone));

-- Auto-update updated_at
CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- Staff can read all customers
CREATE POLICY "customers_read_staff" ON customers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin','billing','sales','support','tech')
    )
  );

-- Customer can read their own record
CREATE POLICY "customers_read_own" ON customers
  FOR SELECT USING (user_id = auth.uid());

-- Admin, billing, sales can write
CREATE POLICY "customers_write_staff" ON customers
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin','billing','sales')
    )
  );

CREATE POLICY "customers_service_role" ON customers
  FOR ALL USING (auth.role() = 'service_role');

-- ── Audit trigger ─────────────────────────────────────────────────────────────
CREATE TRIGGER trg_customers_audit
  AFTER INSERT OR UPDATE OR DELETE ON customers
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
