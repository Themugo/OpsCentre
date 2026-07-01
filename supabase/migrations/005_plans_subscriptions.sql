-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 005: Service plans & subscriptions
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE plan_type           AS ENUM ('home', 'business', 'estate');
CREATE TYPE billing_cycle       AS ENUM ('monthly', 'quarterly', 'annual');
CREATE TYPE subscription_status AS ENUM ('active', 'suspended', 'cancelled');

-- ── Service plans ─────────────────────────────────────────────────────────────
CREATE TABLE service_plans (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              VARCHAR(80)     NOT NULL,
  type              plan_type       NOT NULL,
  speed_down_mbps   INT             NOT NULL,
  speed_up_mbps     INT             NOT NULL,
  price_kes         DECIMAL(10,2)   NOT NULL,
  billing_cycle     billing_cycle   NOT NULL DEFAULT 'monthly',
  data_cap_gb       INT,                       -- NULL = unlimited
  static_ips        INT             NOT NULL DEFAULT 1,
  sla_uptime_pct    DECIMAL(5,2),              -- e.g. 99.5
  description       TEXT,
  is_active         BOOLEAN         NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_plans_type   ON service_plans (type);
CREATE INDEX idx_plans_active ON service_plans (is_active) WHERE is_active = true;

CREATE TRIGGER trg_plans_updated_at
  BEFORE UPDATE ON service_plans
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

ALTER TABLE service_plans ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read active plans (portal, sales)
CREATE POLICY "plans_read_all" ON service_plans
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "plans_admin_write" ON service_plans
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin','billing'))
  );

CREATE POLICY "plans_service_role" ON service_plans
  FOR ALL USING (auth.role() = 'service_role');

-- ── Subscriptions ─────────────────────────────────────────────────────────────
CREATE TABLE subscriptions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id         UUID            NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  plan_id             UUID            NOT NULL REFERENCES service_plans(id),
  status              subscription_status NOT NULL DEFAULT 'active',
  start_date          DATE            NOT NULL DEFAULT CURRENT_DATE,
  next_billing_date   DATE            NOT NULL,
  static_ip           INET,
  -- Proration tracking
  prorate_credit_kes  DECIMAL(10,2)   DEFAULT 0,
  cancelled_at        TIMESTAMPTZ,
  suspended_at        TIMESTAMPTZ,
  suspension_reason   TEXT,
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subs_customer       ON subscriptions (customer_id);
CREATE INDEX idx_subs_plan           ON subscriptions (plan_id);
CREATE INDEX idx_subs_status         ON subscriptions (status);
CREATE INDEX idx_subs_billing_date   ON subscriptions (next_billing_date)
  WHERE status = 'active';

CREATE TRIGGER trg_subs_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subs_read_staff" ON subscriptions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin','billing','sales','support')
    )
  );

CREATE POLICY "subs_read_own" ON subscriptions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM customers c
      WHERE c.id = customer_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "subs_write_staff" ON subscriptions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin','billing')
    )
  );

CREATE POLICY "subs_service_role" ON subscriptions
  FOR ALL USING (auth.role() = 'service_role');

CREATE TRIGGER trg_subs_audit
  AFTER INSERT OR UPDATE OR DELETE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
