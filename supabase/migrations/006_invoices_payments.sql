-- ─────────────────────────────────────────────────────────────────────────────
-- 006_invoices_payments.sql
-- Billing tables: invoices generated per subscription cycle,
-- payments recording each transaction (M-Pesa, Stripe, cash, bank).
-- Depends on: 005_plans_subscriptions
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Invoices ──────────────────────────────────────────────────────────────────
CREATE TABLE public.invoices (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no       VARCHAR(30)   NOT NULL UNIQUE,  -- e.g. INV-2024-00892
  subscription_id  UUID          NOT NULL REFERENCES public.subscriptions(id) ON DELETE RESTRICT,
  amount_kes       DECIMAL(10,2) NOT NULL CHECK (amount_kes > 0),
  status           invoice_status NOT NULL DEFAULT 'draft',
  billing_period_start DATE,
  billing_period_end   DATE,
  due_date         DATE          NOT NULL,
  paid_at          TIMESTAMPTZ,
  notes            TEXT,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Invoice number sequence function
CREATE SEQUENCE IF NOT EXISTS invoice_seq START 1000;

CREATE OR REPLACE FUNCTION public.next_invoice_no()
RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
  RETURN 'INV-' || TO_CHAR(NOW(), 'YYYY') || '-' ||
         LPAD(nextval('invoice_seq')::TEXT, 5, '0');
END;
$$;

-- Auto-set invoice_no if not provided
CREATE OR REPLACE FUNCTION public.set_invoice_no()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.invoice_no IS NULL OR NEW.invoice_no = '' THEN
    NEW.invoice_no = public.next_invoice_no();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER invoices_set_no
  BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_invoice_no();

CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Mark overdue invoices (run via cron daily)
CREATE OR REPLACE FUNCTION public.mark_overdue_invoices()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE updated_count INTEGER;
BEGIN
  UPDATE public.invoices
  SET status = 'overdue', updated_at = NOW()
  WHERE status IN ('sent', 'pending')
    AND due_date < CURRENT_DATE;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

-- Indexes
CREATE INDEX invoices_subscription_idx ON public.invoices (subscription_id);
CREATE INDEX invoices_status_idx       ON public.invoices (status);
CREATE INDEX invoices_due_date_idx     ON public.invoices (due_date);
CREATE INDEX invoices_created_idx      ON public.invoices (created_at DESC);

-- ── Payments ──────────────────────────────────────────────────────────────────
CREATE TABLE public.payments (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    UUID          NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  amount_kes    DECIMAL(10,2) NOT NULL CHECK (amount_kes > 0),
  method        payment_method NOT NULL,
  mpesa_ref     VARCHAR(30),   -- Safaricom transaction ID e.g. QWE1234ABC
  stripe_ref    VARCHAR(80),   -- Stripe charge/payment_intent ID
  notes         TEXT,
  paid_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  recorded_by   UUID          REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- After a payment is recorded, auto-mark invoice as paid if fully covered
CREATE OR REPLACE FUNCTION public.auto_mark_invoice_paid()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE total_paid DECIMAL(10,2);
DECLARE invoice_amount DECIMAL(10,2);
BEGIN
  SELECT COALESCE(SUM(p.amount_kes), 0), i.amount_kes
  INTO total_paid, invoice_amount
  FROM public.payments p
  JOIN public.invoices i ON i.id = p.invoice_id
  WHERE p.invoice_id = NEW.invoice_id
  GROUP BY i.amount_kes;

  IF total_paid >= invoice_amount THEN
    UPDATE public.invoices
    SET status = 'paid', paid_at = NOW(), updated_at = NOW()
    WHERE id = NEW.invoice_id AND status != 'paid';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER payments_auto_mark_paid
  AFTER INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.auto_mark_invoice_paid();

-- Indexes
CREATE INDEX payments_invoice_idx     ON public.payments (invoice_id);
CREATE INDEX payments_method_idx      ON public.payments (method);
CREATE INDEX payments_mpesa_ref_idx   ON public.payments (mpesa_ref) WHERE mpesa_ref IS NOT NULL;
CREATE INDEX payments_paid_at_idx     ON public.payments (paid_at DESC);

-- ── RLS — Invoices ────────────────────────────────────────────────────────────
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_read_invoices"
  ON public.invoices FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'billing', 'support', 'sales')
    )
  );

CREATE POLICY "customer_read_own_invoices"
  ON public.invoices FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.subscriptions s
      JOIN public.customers c ON c.id = s.customer_id
      WHERE s.id = invoices.subscription_id
        AND c.id = auth.uid()
    )
  );

CREATE POLICY "billing_manage_invoices"
  ON public.invoices FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'billing')
    )
  );

-- ── RLS — Payments ────────────────────────────────────────────────────────────
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_read_payments"
  ON public.payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'billing', 'support')
    )
  );

CREATE POLICY "service_role_manage_payments"
  ON public.payments FOR ALL
  USING (auth.role() = 'service_role');
