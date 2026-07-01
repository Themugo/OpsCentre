-- ─────────────────────────────────────────────────────────────────────────────
-- 011_leads.sql
-- CRM lead pipeline — from first contact through to won/lost.
-- Converts to a customer record on win.
-- Depends on: 002_users, 003_addresses
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.leads (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name              VARCHAR(120)  NOT NULL,
  phone             VARCHAR(20)   NOT NULL,
  email             VARCHAR(255),
  source            lead_source   NOT NULL DEFAULT 'web',
  stage             lead_stage    NOT NULL DEFAULT 'new',

  -- Desired plan
  interested_plan_id UUID         REFERENCES public.service_plans(id) ON DELETE SET NULL,
  monthly_value_kes  DECIMAL(10,2),  -- estimated MRR if converted

  -- Location
  address_id        UUID          REFERENCES public.addresses(id) ON DELETE SET NULL,
  area              VARCHAR(80),

  -- Assignment
  assigned_to       UUID          REFERENCES public.users(id) ON DELETE SET NULL,

  -- Conversion
  converted_customer_id UUID      REFERENCES public.customers(id) ON DELETE SET NULL,
  converted_at      TIMESTAMPTZ,

  -- Loss reason
  lost_reason       TEXT,

  notes             TEXT,
  next_follow_up_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-set converted_at when stage → won
CREATE OR REPLACE FUNCTION public.lead_stage_times()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.stage = 'won' AND OLD.stage != 'won' THEN
    NEW.converted_at = COALESCE(NEW.converted_at, NOW());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER leads_auto_times
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.lead_stage_times();

-- ── Lead activity log ─────────────────────────────────────────────────────────
CREATE TABLE public.lead_activities (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id     UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  type        VARCHAR(40) NOT NULL,   -- 'call', 'email', 'visit', 'stage_change', 'note'
  description TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX lead_activities_lead_idx ON public.lead_activities (lead_id, created_at DESC);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX leads_stage_idx       ON public.leads (stage);
CREATE INDEX leads_assigned_idx    ON public.leads (assigned_to);
CREATE INDEX leads_source_idx      ON public.leads (source);
CREATE INDEX leads_created_idx     ON public.leads (created_at DESC);
CREATE INDEX leads_follow_up_idx   ON public.leads (next_follow_up_at)
  WHERE next_follow_up_at IS NOT NULL AND stage NOT IN ('won', 'lost');

-- Full-text search on name + email + phone
CREATE INDEX leads_search_idx ON public.leads
  USING GIN (to_tsvector('english', name || ' ' || COALESCE(email,'') || ' ' || phone));

-- ── Pipeline summary view ─────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.pipeline_summary AS
SELECT
  stage,
  COUNT(*)                                AS lead_count,
  COALESCE(SUM(monthly_value_kes), 0)     AS total_value_kes,
  COALESCE(AVG(monthly_value_kes), 0)     AS avg_value_kes
FROM public.leads
WHERE stage NOT IN ('won', 'lost')
GROUP BY stage
ORDER BY ARRAY_POSITION(ARRAY['new','qualified','proposal'], stage::TEXT);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.leads           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_staff_read_leads"
  ON public.leads FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'sales', 'support')
    )
  );

CREATE POLICY "sales_manage_leads"
  ON public.leads FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'sales')
    )
  );

CREATE POLICY "staff_read_lead_activities"
  ON public.lead_activities FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'sales', 'support')
    )
  );

CREATE POLICY "sales_write_lead_activities"
  ON public.lead_activities FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'sales')
    )
  );
