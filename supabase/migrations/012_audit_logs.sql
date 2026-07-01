-- ─────────────────────────────────────────────────────────────────────────────
-- 012_audit_logs.sql
-- Immutable audit trail of every data change across the system.
-- Written by triggers on critical tables. Never updated or deleted.
-- Depends on: 002_users
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.audit_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  action      VARCHAR(20) NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  table_name  VARCHAR(60) NOT NULL,
  record_id   UUID        NOT NULL,
  old_data    JSONB,      -- previous row values (null for INSERT)
  new_data    JSONB,      -- new row values (null for DELETE)
  diff        JSONB,      -- only the changed fields (UPDATE only)
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit logs are APPEND-ONLY — no updates, no deletes
CREATE RULE audit_no_update AS ON UPDATE TO public.audit_logs DO INSTEAD NOTHING;
CREATE RULE audit_no_delete AS ON DELETE TO public.audit_logs DO INSTEAD NOTHING;

-- ── Generic audit trigger function ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_audit_log()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  old_json JSONB := NULL;
  new_json JSONB := NULL;
  diff_json JSONB := NULL;
  record_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    new_json := to_jsonb(NEW);
    record_id := (new_json->>'id')::UUID;
    diff_json := new_json;
  ELSIF TG_OP = 'UPDATE' THEN
    old_json := to_jsonb(OLD);
    new_json := to_jsonb(NEW);
    record_id := (new_json->>'id')::UUID;
    -- Compute diff: only changed keys
    SELECT jsonb_object_agg(key, value)
    INTO diff_json
    FROM jsonb_each(new_json) AS n(key, value)
    WHERE new_json->key IS DISTINCT FROM old_json->key;
  ELSIF TG_OP = 'DELETE' THEN
    old_json := to_jsonb(OLD);
    record_id := (old_json->>'id')::UUID;
  END IF;

  INSERT INTO public.audit_logs (
    user_id, action, table_name, record_id, old_data, new_data, diff
  ) VALUES (
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    record_id,
    old_json,
    new_json,
    diff_json
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ── Attach audit triggers to critical tables ──────────────────────────────────

-- Customers
CREATE TRIGGER audit_customers
  AFTER INSERT OR UPDATE OR DELETE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.record_audit_log();

-- Invoices
CREATE TRIGGER audit_invoices
  AFTER INSERT OR UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.record_audit_log();

-- Payments
CREATE TRIGGER audit_payments
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.record_audit_log();

-- M-Pesa transactions
CREATE TRIGGER audit_mpesa_transactions
  AFTER INSERT OR UPDATE ON public.mpesa_transactions
  FOR EACH ROW EXECUTE FUNCTION public.record_audit_log();

-- Subscriptions
CREATE TRIGGER audit_subscriptions
  AFTER INSERT OR UPDATE OR DELETE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.record_audit_log();

-- Users (role changes, deactivation)
CREATE TRIGGER audit_users
  AFTER UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.record_audit_log();

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX audit_table_record_idx ON public.audit_logs (table_name, record_id);
CREATE INDEX audit_user_idx         ON public.audit_logs (user_id, created_at DESC);
CREATE INDEX audit_created_idx      ON public.audit_logs (created_at DESC);
CREATE INDEX audit_action_idx       ON public.audit_logs (action);

-- Partition hint: if audit_logs grows large, partition by month:
-- PARTITION BY RANGE (created_at) -- add when row count > 1M

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_audit_logs"
  ON public.audit_logs FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- Only service_role and triggers can write
CREATE POLICY "service_role_write_audit"
  ON public.audit_logs FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
