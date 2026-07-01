-- ─────────────────────────────────────────────────────────────────────────────
-- 013_finance_and_cron.sql
-- Materialized views for the finance dashboard + auto-invoicing function
-- called by a Supabase Edge Function cron job.
-- Depends on: 006_invoices_payments, 005_plans_subscriptions, 004_customers
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Monthly revenue view ──────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.monthly_revenue AS
SELECT
  DATE_TRUNC('month', p.paid_at)            AS month,
  COUNT(DISTINCT p.id)                       AS payment_count,
  SUM(p.amount_kes)                          AS total_kes,
  COUNT(DISTINCT i.subscription_id)          AS paying_subscriptions,
  SUM(p.amount_kes) FILTER (WHERE p.method = 'mpesa')  AS mpesa_kes,
  SUM(p.amount_kes) FILTER (WHERE p.method = 'stripe') AS stripe_kes,
  SUM(p.amount_kes) FILTER (WHERE p.method = 'cash')   AS cash_kes,
  SUM(p.amount_kes) FILTER (WHERE p.method = 'bank')   AS bank_kes
FROM public.payments p
JOIN public.invoices i ON i.id = p.invoice_id
WHERE p.paid_at IS NOT NULL
GROUP BY 1
ORDER BY 1 DESC;

-- ── Revenue by plan type ──────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.revenue_by_plan_type AS
SELECT
  sp.type                                    AS plan_type,
  sp.name                                    AS plan_name,
  COUNT(DISTINCT s.id)                       AS active_subscriptions,
  SUM(p.amount_kes)                          AS total_kes,
  ROUND(AVG(p.amount_kes)::NUMERIC, 2)       AS avg_payment_kes
FROM public.payments p
JOIN public.invoices i  ON i.id  = p.invoice_id
JOIN public.subscriptions s ON s.id = i.subscription_id
JOIN public.service_plans sp ON sp.id = s.plan_id
WHERE p.paid_at >= DATE_TRUNC('month', NOW())
GROUP BY sp.type, sp.name
ORDER BY total_kes DESC;

-- ── Churn analysis ────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.churn_summary AS
WITH monthly AS (
  SELECT
    DATE_TRUNC('month', updated_at)  AS month,
    COUNT(*) FILTER (WHERE status = 'churned') AS churned_count,
    COUNT(*) FILTER (WHERE status = 'active')  AS active_count
  FROM public.customers
  GROUP BY 1
)
SELECT
  month,
  churned_count,
  active_count,
  ROUND(
    (churned_count::NUMERIC / NULLIF(active_count + churned_count, 0)) * 100, 2
  ) AS churn_rate_pct
FROM monthly
ORDER BY month DESC;

-- ── ARPU (Average Revenue Per User) ──────────────────────────────────────────
CREATE OR REPLACE VIEW public.arpu_monthly AS
SELECT
  DATE_TRUNC('month', p.paid_at)             AS month,
  COUNT(DISTINCT s.customer_id)              AS paying_customers,
  SUM(p.amount_kes)                          AS total_kes,
  ROUND(
    SUM(p.amount_kes) / NULLIF(COUNT(DISTINCT s.customer_id), 0), 2
  )                                          AS arpu_kes
FROM public.payments p
JOIN public.invoices i  ON i.id  = p.invoice_id
JOIN public.subscriptions s ON s.id = i.subscription_id
WHERE p.paid_at IS NOT NULL
GROUP BY 1
ORDER BY 1 DESC;

-- ── Collection rate view ──────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.collection_rate_monthly AS
SELECT
  DATE_TRUNC('month', i.due_date)            AS month,
  COUNT(*)                                   AS total_invoices,
  COUNT(*) FILTER (WHERE i.status = 'paid')  AS paid_invoices,
  SUM(i.amount_kes)                          AS total_billed_kes,
  SUM(i.amount_kes) FILTER (WHERE i.status = 'paid') AS collected_kes,
  ROUND(
    SUM(i.amount_kes) FILTER (WHERE i.status = 'paid') /
    NULLIF(SUM(i.amount_kes), 0) * 100, 1
  )                                          AS collection_rate_pct
FROM public.invoices i
WHERE i.status != 'draft'
GROUP BY 1
ORDER BY 1 DESC;

-- ── Auto-invoicing function ───────────────────────────────────────────────────
-- Called daily by a Supabase Edge Function cron (or pg_cron if enabled).
-- Generates invoices for subscriptions whose next_billing_date = TODAY.
CREATE OR REPLACE FUNCTION public.generate_due_invoices()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  sub RECORD;
  new_invoice_id UUID;
  generated_count INTEGER := 0;
BEGIN
  FOR sub IN
    SELECT
      s.id              AS subscription_id,
      s.customer_id,
      s.plan_id,
      s.next_billing_date,
      sp.price_kes,
      sp.billing_cycle,
      sp.name           AS plan_name
    FROM public.subscriptions s
    JOIN public.service_plans sp ON sp.id = s.plan_id
    WHERE s.status = 'active'
      AND s.next_billing_date <= CURRENT_DATE
      AND NOT EXISTS (
        -- Avoid duplicate invoices for same period
        SELECT 1 FROM public.invoices i
        WHERE i.subscription_id = s.id
          AND i.billing_period_start = s.next_billing_date
          AND i.status != 'draft'
      )
  LOOP
    -- Create invoice
    INSERT INTO public.invoices (
      subscription_id,
      amount_kes,
      status,
      billing_period_start,
      billing_period_end,
      due_date
    ) VALUES (
      sub.subscription_id,
      sub.price_kes,
      'sent',
      sub.next_billing_date,
      sub.next_billing_date + CASE sub.billing_cycle
        WHEN 'monthly'    THEN INTERVAL '1 month'
        WHEN 'quarterly'  THEN INTERVAL '3 months'
        WHEN 'annual'     THEN INTERVAL '12 months'
      END - INTERVAL '1 day',
      sub.next_billing_date + INTERVAL '7 days'  -- 7-day grace period
    )
    RETURNING id INTO new_invoice_id;

    -- Advance next_billing_date on the subscription
    UPDATE public.subscriptions
    SET
      next_billing_date = next_billing_date + CASE sub.billing_cycle
        WHEN 'monthly'   THEN INTERVAL '1 month'
        WHEN 'quarterly' THEN INTERVAL '3 months'
        WHEN 'annual'    THEN INTERVAL '12 months'
      END,
      updated_at = NOW()
    WHERE id = sub.subscription_id;

    generated_count := generated_count + 1;
  END LOOP;

  RETURN generated_count;
END;
$$;

-- ── Subscription suspension for non-payment ───────────────────────────────────
-- Suspend subscriptions with invoices overdue > 14 days (run weekly)
CREATE OR REPLACE FUNCTION public.suspend_overdue_subscriptions()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  suspended_count INTEGER := 0;
BEGIN
  UPDATE public.subscriptions s
  SET status = 'suspended', updated_at = NOW()
  FROM public.invoices i
  WHERE i.subscription_id = s.id
    AND s.status = 'active'
    AND i.status = 'overdue'
    AND i.due_date < CURRENT_DATE - INTERVAL '14 days';

  GET DIAGNOSTICS suspended_count = ROW_COUNT;
  RETURN suspended_count;
END;
$$;
