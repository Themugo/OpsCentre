-- ─────────────────────────────────────────────────────────────────────────────
-- 010_support_tickets.sql
-- Customer support tickets with priority, category, SLA tracking,
-- and threaded comments.
-- Depends on: 002_users, 004_customers
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Support tickets ───────────────────────────────────────────────────────────
CREATE TABLE public.support_tickets (
  id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_no       VARCHAR(20)     NOT NULL UNIQUE,   -- e.g. TKT-00041
  customer_id     UUID            NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  assigned_to     UUID            REFERENCES public.users(id) ON DELETE SET NULL,
  category        ticket_category NOT NULL DEFAULT 'general',
  priority        ticket_priority NOT NULL DEFAULT 'medium',
  status          ticket_status   NOT NULL DEFAULT 'open',
  subject         VARCHAR(200)    NOT NULL,
  description     TEXT,

  -- SLA tracking
  sla_hours       INTEGER         NOT NULL DEFAULT 24,  -- target resolution hours
  sla_breached    BOOLEAN         NOT NULL DEFAULT FALSE,
  sla_due_at      TIMESTAMPTZ     GENERATED ALWAYS AS
                    (created_at + (sla_hours || ' hours')::INTERVAL) STORED,

  -- Related entities
  related_job_id      UUID        REFERENCES public.field_jobs(id) ON DELETE SET NULL,
  related_invoice_id  UUID        REFERENCES public.invoices(id) ON DELETE SET NULL,

  resolved_at     TIMESTAMPTZ,
  closed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Ticket number sequence
CREATE SEQUENCE IF NOT EXISTS ticket_seq START 1;

CREATE OR REPLACE FUNCTION public.set_ticket_no()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ticket_no IS NULL OR NEW.ticket_no = '' THEN
    NEW.ticket_no = 'TKT-' || LPAD(nextval('ticket_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tickets_set_no
  BEFORE INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_ticket_no();

CREATE TRIGGER support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-set resolved_at / closed_at timestamps
CREATE OR REPLACE FUNCTION public.ticket_status_times()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'resolved' AND OLD.status != 'resolved' THEN
    NEW.resolved_at = COALESCE(NEW.resolved_at, NOW());
  END IF;
  IF NEW.status = 'closed' AND OLD.status != 'closed' THEN
    NEW.closed_at = COALESCE(NEW.closed_at, NOW());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tickets_auto_times
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.ticket_status_times();

-- SLA breach check (run via cron every 15 min)
CREATE OR REPLACE FUNCTION public.check_sla_breaches()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE updated_count INTEGER;
BEGIN
  UPDATE public.support_tickets
  SET sla_breached = TRUE, updated_at = NOW()
  WHERE sla_breached = FALSE
    AND status NOT IN ('resolved', 'closed')
    AND sla_due_at < NOW();
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

-- SLA default by priority
CREATE OR REPLACE FUNCTION public.set_ticket_sla()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.sla_hours = CASE NEW.priority
    WHEN 'critical' THEN 4
    WHEN 'high'     THEN 8
    WHEN 'medium'   THEN 24
    WHEN 'low'      THEN 72
    ELSE 24
  END;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tickets_set_sla
  BEFORE INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_ticket_sla();

-- ── Ticket comments ───────────────────────────────────────────────────────────
CREATE TABLE public.ticket_comments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID        NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_id   UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  body        TEXT        NOT NULL,
  is_internal BOOLEAN     NOT NULL DEFAULT FALSE,  -- internal notes hidden from customer
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ticket_comments_ticket_idx ON public.ticket_comments (ticket_id, created_at);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX tickets_customer_idx    ON public.support_tickets (customer_id);
CREATE INDEX tickets_assigned_idx    ON public.support_tickets (assigned_to);
CREATE INDEX tickets_status_idx      ON public.support_tickets (status);
CREATE INDEX tickets_priority_idx    ON public.support_tickets (priority);
CREATE INDEX tickets_sla_breach_idx  ON public.support_tickets (sla_breached) WHERE sla_breached = TRUE;
CREATE INDEX tickets_created_idx     ON public.support_tickets (created_at DESC);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.support_tickets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_comments  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_read_tickets"
  ON public.support_tickets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'support', 'billing', 'sales')
    )
  );

CREATE POLICY "customer_read_own_tickets"
  ON public.support_tickets FOR SELECT
  USING (customer_id = auth.uid());

CREATE POLICY "customer_create_ticket"
  ON public.support_tickets FOR INSERT
  WITH CHECK (customer_id = auth.uid());

CREATE POLICY "support_manage_tickets"
  ON public.support_tickets FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'support')
    )
  );

-- Comments: staff see all, customers only see non-internal
CREATE POLICY "staff_read_comments"
  ON public.ticket_comments FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','support','billing'))
  );

CREATE POLICY "customer_read_public_comments"
  ON public.ticket_comments FOR SELECT
  USING (
    is_internal = FALSE AND
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_comments.ticket_id AND t.customer_id = auth.uid()
    )
  );

CREATE POLICY "staff_write_comments"
  ON public.ticket_comments FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','support'))
  );
