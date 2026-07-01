-- ─────────────────────────────────────────────────────────────────────────────
-- 017_broadcasts.sql
-- Bulk SMS and email campaigns sent to filtered customer segments.
-- Tracks every individual send attempt and delivery status.
-- Depends on: 002_users, 004_customers
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Broadcast channel enum ────────────────────────────────────────────────────
CREATE TYPE broadcast_channel AS ENUM ('sms', 'email', 'both');
CREATE TYPE broadcast_status  AS ENUM ('draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled');
CREATE TYPE send_status       AS ENUM ('pending', 'sent', 'delivered', 'failed', 'bounced');

-- ── Broadcasts ────────────────────────────────────────────────────────────────
CREATE TABLE public.broadcasts (
  id              UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  title           VARCHAR(200)      NOT NULL,      -- internal name (not shown to customers)
  channel         broadcast_channel NOT NULL,

  -- Content
  sms_body        TEXT,                             -- max 160 chars for single SMS
  email_subject   VARCHAR(200),
  email_html      TEXT,

  -- Audience filters (stored as JSONB for flexibility)
  -- e.g. {"status":"active","type":"home","area":"Westlands","plan_type":"home"}
  audience_filter JSONB             NOT NULL DEFAULT '{}',

  -- Counters (populated after send)
  total_recipients INTEGER          NOT NULL DEFAULT 0,
  sent_count       INTEGER          NOT NULL DEFAULT 0,
  failed_count     INTEGER          NOT NULL DEFAULT 0,
  delivered_count  INTEGER          NOT NULL DEFAULT 0,

  -- Status
  status          broadcast_status  NOT NULL DEFAULT 'draft',
  scheduled_at    TIMESTAMPTZ,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,

  -- Metadata
  created_by      UUID              REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

CREATE TRIGGER broadcasts_updated_at
  BEFORE UPDATE ON public.broadcasts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Indexes
CREATE INDEX broadcasts_status_idx     ON public.broadcasts (status);
CREATE INDEX broadcasts_created_idx    ON public.broadcasts (created_at DESC);
CREATE INDEX broadcasts_scheduled_idx  ON public.broadcasts (scheduled_at)
  WHERE status = 'scheduled' AND scheduled_at IS NOT NULL;

-- ── Broadcast send log ────────────────────────────────────────────────────────
-- One row per customer per broadcast attempt
CREATE TABLE public.broadcast_sends (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id    UUID          NOT NULL REFERENCES public.broadcasts(id) ON DELETE CASCADE,
  customer_id     UUID          NOT NULL REFERENCES public.customers(id)  ON DELETE CASCADE,
  channel         VARCHAR(10)   NOT NULL,   -- 'sms' or 'email'
  recipient       VARCHAR(255)  NOT NULL,   -- phone number or email address
  status          send_status   NOT NULL DEFAULT 'pending',
  error_message   TEXT,
  sent_at         TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX bsends_broadcast_idx  ON public.broadcast_sends (broadcast_id, status);
CREATE INDEX bsends_customer_idx   ON public.broadcast_sends (customer_id);
CREATE UNIQUE INDEX bsends_unique  ON public.broadcast_sends (broadcast_id, customer_id, channel);

-- ── Audience preview function ──────────────────────────────────────────────────
-- Returns count + sample of customers matching a filter
CREATE OR REPLACE FUNCTION public.preview_broadcast_audience(
  p_filter JSONB
) RETURNS TABLE (
  customer_id   UUID,
  name          VARCHAR,
  phone         VARCHAR,
  email         VARCHAR,
  type          customer_type,
  status        customer_status,
  area          VARCHAR,
  plan_name     VARCHAR
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.phone,
    c.email,
    c.type,
    c.status,
    a.area,
    sp.name AS plan_name
  FROM public.customers c
  LEFT JOIN public.addresses a       ON a.id  = c.address_id
  LEFT JOIN public.subscriptions s   ON s.customer_id = c.id AND s.status = 'active'
  LEFT JOIN public.service_plans sp  ON sp.id = s.plan_id
  WHERE
    -- Status filter
    (p_filter->>'status' IS NULL OR c.status::TEXT = p_filter->>'status')
    -- Type filter
    AND (p_filter->>'type' IS NULL OR c.type::TEXT = p_filter->>'type')
    -- Area filter
    AND (p_filter->>'area' IS NULL OR a.area ILIKE '%' || (p_filter->>'area') || '%')
    -- Plan type filter
    AND (p_filter->>'plan_type' IS NULL OR sp.type::TEXT = p_filter->>'plan_type')
    -- Has phone (required for SMS)
    AND (p_filter->>'channel' != 'sms' OR c.phone IS NOT NULL)
    -- Has email (required for email)
    AND (p_filter->>'channel' != 'email' OR c.email IS NOT NULL)
  ORDER BY c.name
  LIMIT 1000;
END;
$$;

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.broadcasts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_read_broadcasts"
  ON public.broadcasts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'billing', 'support', 'sales')
    )
  );

CREATE POLICY "admin_manage_broadcasts"
  ON public.broadcasts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'billing')
    )
  );

CREATE POLICY "staff_read_broadcast_sends"
  ON public.broadcast_sends FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'billing', 'support')
    )
  );

CREATE POLICY "service_role_write_broadcast_sends"
  ON public.broadcast_sends FOR ALL
  USING (auth.role() = 'service_role');
