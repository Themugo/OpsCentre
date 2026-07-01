-- ─────────────────────────────────────────────────────────────────────────────
-- 015_notifications.sql
-- In-app notifications for customers and staff.
-- Written by triggers and backend services; read by /api/notifications.
-- Depends on: 002_users, 004_customers
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.notifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        VARCHAR(40) NOT NULL,   -- 'invoice','payment','outage','ticket','upgrade','general'
  title       VARCHAR(200) NOT NULL,
  body        TEXT         NOT NULL,
  is_read     BOOLEAN      NOT NULL DEFAULT FALSE,
  meta        JSONB        DEFAULT '{}',   -- extra context e.g. {invoice_no, ticket_no}
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX notifications_user_idx    ON public.notifications (user_id, created_at DESC);
CREATE INDEX notifications_unread_idx  ON public.notifications (user_id, is_read) WHERE is_read = FALSE;

-- ── Helper function: push a notification to a user ────────────────────────────
CREATE OR REPLACE FUNCTION public.push_notification(
  p_user_id  UUID,
  p_type     VARCHAR,
  p_title    VARCHAR,
  p_body     TEXT,
  p_meta     JSONB DEFAULT '{}'
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  new_id UUID;
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, meta)
  VALUES (p_user_id, p_type, p_title, p_body, p_meta)
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

-- ── Auto-notify customer on invoice creation ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_invoice_created()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  customer_id UUID;
  customer_name TEXT;
BEGIN
  -- Find the customer linked to this invoice's subscription
  SELECT c.id, c.name
  INTO customer_id, customer_name
  FROM public.subscriptions s
  JOIN public.customers c ON c.id = s.customer_id
  WHERE s.id = NEW.subscription_id;

  IF customer_id IS NOT NULL AND NEW.status IN ('sent', 'pending') THEN
    PERFORM public.push_notification(
      customer_id,
      'invoice',
      'New invoice ready',
      format('Invoice %s for KES %s is due on %s.',
        NEW.invoice_no,
        to_char(NEW.amount_kes, 'FM999,999,990'),
        to_char(NEW.due_date, 'DD Mon YYYY')
      ),
      jsonb_build_object('invoice_id', NEW.id, 'invoice_no', NEW.invoice_no)
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER notify_on_invoice_created
  AFTER INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.notify_invoice_created();

-- ── Auto-notify customer on payment confirmed ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_payment_confirmed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  customer_id   UUID;
  invoice_no    TEXT;
BEGIN
  SELECT c.id, i.invoice_no
  INTO customer_id, invoice_no
  FROM public.invoices i
  JOIN public.subscriptions s ON s.id = i.subscription_id
  JOIN public.customers c ON c.id = s.customer_id
  WHERE i.id = NEW.invoice_id;

  IF customer_id IS NOT NULL THEN
    PERFORM public.push_notification(
      customer_id,
      'payment',
      'Payment confirmed',
      format('KES %s received for %s. Receipt: %s.',
        to_char(NEW.amount_kes, 'FM999,999,990'),
        invoice_no,
        COALESCE(NEW.mpesa_ref, NEW.stripe_ref, 'N/A')
      ),
      jsonb_build_object('invoice_id', NEW.invoice_id, 'receipt', NEW.mpesa_ref)
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER notify_on_payment
  AFTER INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.notify_payment_confirmed();

-- ── Auto-notify customer when ticket status changes ───────────────────────────
CREATE OR REPLACE FUNCTION public.notify_ticket_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status = 'resolved' AND OLD.status != 'resolved' THEN
    PERFORM public.push_notification(
      NEW.customer_id,
      'ticket',
      'Ticket resolved',
      format('Your ticket %s "%s" has been resolved.',
        NEW.ticket_no, NEW.subject
      ),
      jsonb_build_object('ticket_id', NEW.id, 'ticket_no', NEW.ticket_no)
    );
  ELSIF NEW.status = 'in_progress' AND OLD.status = 'open' THEN
    PERFORM public.push_notification(
      NEW.customer_id,
      'ticket',
      'Ticket in progress',
      format('A support agent is working on your ticket %s.', NEW.ticket_no),
      jsonb_build_object('ticket_id', NEW.id, 'ticket_no', NEW.ticket_no)
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER notify_on_ticket_update
  AFTER UPDATE OF status ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.notify_ticket_update();

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can only read their own notifications
CREATE POLICY "read_own_notifications"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid());

-- Users can update is_read on their own notifications
CREATE POLICY "mark_own_notifications_read"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Service role can write (for trigger functions + backend)
CREATE POLICY "service_role_write_notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
