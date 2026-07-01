-- ─────────────────────────────────────────────────────────────────────────────
-- 008_field_jobs.sql
-- Field technician job assignments — installations, repairs, surveys, upgrades.
-- Depends on: 002_users, 003_addresses, 004_customers
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.field_jobs (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  type            job_type      NOT NULL,
  customer_id     UUID          NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  address_id      UUID          REFERENCES public.addresses(id) ON DELETE SET NULL,
  technician_id   UUID          REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_by     UUID          REFERENCES public.users(id) ON DELETE SET NULL,

  status          job_status    NOT NULL DEFAULT 'scheduled',
  priority        ticket_priority NOT NULL DEFAULT 'medium',

  scheduled_at    TIMESTAMPTZ   NOT NULL,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,

  -- Checklist items completed (stored as JSONB array of {label, done})
  checklist       JSONB         NOT NULL DEFAULT '[]',

  -- Photo URLs uploaded by technician
  photos          TEXT[]        NOT NULL DEFAULT '{}',

  -- Customer signature (base64 or storage URL)
  signature_url   TEXT,

  notes           TEXT,
  resolution_notes TEXT,

  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TRIGGER field_jobs_updated_at
  BEFORE UPDATE ON public.field_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-set started_at when status → in_progress
CREATE OR REPLACE FUNCTION public.field_job_status_times()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'in_progress' AND OLD.status != 'in_progress' THEN
    NEW.started_at = COALESCE(NEW.started_at, NOW());
  END IF;
  IF NEW.status = 'done' AND OLD.status != 'done' THEN
    NEW.completed_at = COALESCE(NEW.completed_at, NOW());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER field_jobs_auto_times
  BEFORE UPDATE ON public.field_jobs
  FOR EACH ROW EXECUTE FUNCTION public.field_job_status_times();

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX field_jobs_customer_idx    ON public.field_jobs (customer_id);
CREATE INDEX field_jobs_tech_idx        ON public.field_jobs (technician_id);
CREATE INDEX field_jobs_status_idx      ON public.field_jobs (status);
CREATE INDEX field_jobs_scheduled_idx   ON public.field_jobs (scheduled_at DESC);
CREATE INDEX field_jobs_date_idx        ON public.field_jobs (DATE(scheduled_at));

-- ── Today's jobs view (used by field app) ────────────────────────────────────
CREATE OR REPLACE VIEW public.todays_field_jobs AS
SELECT
  fj.*,
  c.name   AS customer_name,
  c.phone  AS customer_phone,
  a.street AS address_street,
  a.area   AS address_area,
  u.name   AS technician_name
FROM public.field_jobs fj
JOIN public.customers c ON c.id = fj.customer_id
LEFT JOIN public.addresses a ON a.id = fj.address_id
LEFT JOIN public.users u ON u.id = fj.technician_id
WHERE DATE(fj.scheduled_at AT TIME ZONE 'Africa/Nairobi') = CURRENT_DATE;

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.field_jobs ENABLE ROW LEVEL SECURITY;

-- Admin and support see all jobs
CREATE POLICY "staff_read_field_jobs"
  ON public.field_jobs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'support', 'billing')
    )
  );

-- Technicians only see their own assigned jobs
CREATE POLICY "tech_read_own_jobs"
  ON public.field_jobs FOR SELECT
  USING (
    technician_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'tech'
    )
  );

-- Technicians can update their own job status, checklist, notes, photos
CREATE POLICY "tech_update_own_jobs"
  ON public.field_jobs FOR UPDATE
  USING (
    technician_id = auth.uid() AND
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'tech')
  )
  WITH CHECK (technician_id = auth.uid());

-- Admin/support can manage all jobs
CREATE POLICY "staff_manage_field_jobs"
  ON public.field_jobs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'support')
    )
  );
