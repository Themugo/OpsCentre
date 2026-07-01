-- ─────────────────────────────────────────────────────────────────────────────
-- 007_mpesa_transactions.sql
-- Records every M-Pesa STK Push and C2B transaction attempt.
-- Decoupled from payments — a transaction can fail without creating a payment.
-- Depends on: 006_invoices_payments
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.mpesa_transactions (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id            UUID         NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  phone                 VARCHAR(15)  NOT NULL,
  amount_kes            DECIMAL(10,2) NOT NULL,

  -- Daraja request identifiers
  checkout_request_id   VARCHAR(100) UNIQUE,
  merchant_request_id   VARCHAR(100),

  -- Status lifecycle
  status                mpesa_status NOT NULL DEFAULT 'pending',

  -- Populated on success
  mpesa_receipt         VARCHAR(30),  -- e.g. QWE9876XYZ (Safaricom receipt)

  -- Populated on callback (success or failure)
  result_code           INTEGER,
  result_desc           TEXT,

  initiated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  completed_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Fast callback lookup by Daraja ID
CREATE INDEX mpesa_checkout_idx
  ON public.mpesa_transactions (checkout_request_id)
  WHERE checkout_request_id IS NOT NULL;

-- Invoice transactions
CREATE INDEX mpesa_invoice_idx
  ON public.mpesa_transactions (invoice_id, status);

-- Pending transactions (reconciliation cron)
CREATE INDEX mpesa_pending_idx
  ON public.mpesa_transactions (status, initiated_at)
  WHERE status = 'pending';

-- Receipt lookup
CREATE INDEX mpesa_receipt_idx
  ON public.mpesa_transactions (mpesa_receipt)
  WHERE mpesa_receipt IS NOT NULL;

-- ── Helper view: stale pending (> 2 min old, candidate for STK query) ────────
CREATE OR REPLACE VIEW public.stale_pending_transactions AS
SELECT
  mt.id,
  mt.checkout_request_id,
  mt.invoice_id,
  mt.phone,
  mt.amount_kes,
  mt.initiated_at,
  EXTRACT(EPOCH FROM (NOW() - mt.initiated_at))::INT AS age_seconds,
  i.invoice_no
FROM public.mpesa_transactions mt
JOIN public.invoices i ON i.id = mt.invoice_id
WHERE mt.status = 'pending'
  AND mt.initiated_at < NOW() - INTERVAL '2 minutes';

-- ── Revenue summary view (finance dashboard) ──────────────────────────────────
CREATE OR REPLACE VIEW public.mpesa_revenue_summary AS
SELECT
  DATE_TRUNC('month', completed_at)         AS month,
  COUNT(*)                                  AS transaction_count,
  SUM(amount_kes)                           AS total_collected_kes,
  ROUND(AVG(amount_kes)::NUMERIC, 2)        AS avg_transaction_kes,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed_count
FROM public.mpesa_transactions
WHERE status = 'success'
  AND completed_at IS NOT NULL
GROUP BY 1
ORDER BY 1 DESC;

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.mpesa_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "billing_read_mpesa"
  ON public.mpesa_transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'billing')
    )
  );

-- Only service_role key (used by API routes) can write
CREATE POLICY "service_role_write_mpesa"
  ON public.mpesa_transactions FOR ALL
  USING (auth.role() = 'service_role');
