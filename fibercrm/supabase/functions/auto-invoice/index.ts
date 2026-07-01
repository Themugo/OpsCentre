// ─── Supabase Edge Function: auto-invoice ────────────────────────────────────
// Runs daily via Supabase cron scheduler.
// 1. Calls generate_due_invoices() — creates invoices for subscriptions due today
// 2. Calls mark_overdue_invoices()  — marks past-due invoices as overdue
// 3. Calls check_sla_breaches()     — flags support tickets that missed SLA
// 4. Sends SMS/email reminders for overdue invoices
// 5. Suspends subscriptions overdue > 14 days
//
// Deploy: supabase functions deploy auto-invoice
// Schedule in Supabase dashboard: select * from cron.job (pg_cron)
//   SELECT cron.schedule('auto-invoice', '0 6 * * *', 'SELECT net.http_post(...)');

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AT_API_KEY           = Deno.env.get("AFRICASTALKING_API_KEY") ?? "";
const AT_USERNAME          = Deno.env.get("AFRICASTALKING_USERNAME") ?? "sandbox";
const MPESA_SHORTCODE      = Deno.env.get("MPESA_SHORTCODE") ?? "123456";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Send SMS via Africa's Talking ─────────────────────────────────────────────
async function sendSMS(phone: string, message: string): Promise<void> {
  if (!AT_API_KEY) return;
  const normalized = phone.replace(/^0/, "+254").replace(/^254/, "+254");
  await fetch("https://api.africastalking.com/version1/messaging", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      apiKey: AT_API_KEY,
    },
    body: new URLSearchParams({
      username: AT_USERNAME,
      to: normalized,
      message: message.slice(0, 160),
    }),
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  // Verify this is an authorised internal call
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${SUPABASE_SERVICE_KEY}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const results: Record<string, number | string> = {};

  // ── 1. Generate due invoices ──────────────────────────────────────────────
  const { data: generated, error: genErr } = await supabase
    .rpc("generate_due_invoices");

  results.invoices_generated = genErr ? `error: ${genErr.message}` : (generated ?? 0);

  // ── 2. Mark overdue invoices ──────────────────────────────────────────────
  const { data: overdueCount, error: overdueErr } = await supabase
    .rpc("mark_overdue_invoices");

  results.invoices_marked_overdue = overdueErr ? `error: ${overdueErr.message}` : (overdueCount ?? 0);

  // ── 3. Check SLA breaches ─────────────────────────────────────────────────
  const { data: slaCount, error: slaErr } = await supabase
    .rpc("check_sla_breaches");

  results.sla_breaches_flagged = slaErr ? `error: ${slaErr.message}` : (slaCount ?? 0);

  // ── 4. Send SMS reminders for overdue invoices ────────────────────────────
  const { data: overdueInvoices } = await supabase
    .from("invoices")
    .select(`
      id, invoice_no, amount_kes, due_date,
      subscriptions(
        customers(name, phone, email)
      )
    `)
    .eq("status", "overdue")
    .gte("due_date", new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));

  let smsSent = 0;
  for (const inv of overdueInvoices ?? []) {
    const customer = (inv.subscriptions as any)?.customers;
    if (!customer?.phone) continue;

    await sendSMS(
      customer.phone,
      `FiberCRM: OVERDUE - Invoice ${inv.invoice_no} for KES ${Number(inv.amount_kes).toLocaleString()} is past due. ` +
      `Pay via M-Pesa Paybill ${MPESA_SHORTCODE}, Acc: ${inv.invoice_no}. Call 0800 000 000 for help.`
    );
    smsSent++;
  }
  results.sms_reminders_sent = smsSent;

  // ── 5. Suspend subscriptions overdue > 14 days ───────────────────────────
  const { data: suspended, error: suspErr } = await supabase
    .rpc("suspend_overdue_subscriptions");

  results.subscriptions_suspended = suspErr ? `error: ${suspErr.message}` : (suspended ?? 0);

  // ── 6. Send suspension SMS ────────────────────────────────────────────────
  if ((results.subscriptions_suspended as number) > 0) {
    const { data: justSuspended } = await supabase
      .from("subscriptions")
      .select(`
        id,
        customers(name, phone),
        service_plans(name)
      `)
      .eq("status", "suspended")
      .gte("updated_at", new Date(Date.now() - 60000).toISOString());

    for (const sub of justSuspended ?? []) {
      const customer = (sub as any).customers;
      const plan     = (sub as any).service_plans;
      if (!customer?.phone) continue;

      await sendSMS(
        customer.phone,
        `FiberCRM: Your ${plan?.name} connection has been suspended for non-payment. ` +
        `Pay your overdue invoice via M-Pesa Paybill ${MPESA_SHORTCODE} to reconnect. ` +
        `Call 0800 000 000 for help.`
      );
    }
  }

  console.log("[auto-invoice] Run complete:", results);

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { "Content-Type": "application/json" },
  });
});
