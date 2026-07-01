// ─── Supabase Edge Function: reconcile-mpesa ─────────────────────────────────
// Runs every 5 minutes via cron.
// Finds pending M-Pesa transactions older than 2 minutes that never received
// a callback, then queries Daraja for their real status.
//
// Deploy: supabase functions deploy reconcile-mpesa
// Cron:   every 5 minutes → '*/5 * * * *'

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MPESA_ENV            = Deno.env.get("MPESA_ENV") ?? "sandbox";
const MPESA_CONSUMER_KEY   = Deno.env.get("MPESA_CONSUMER_KEY")!;
const MPESA_CONSUMER_SECRET= Deno.env.get("MPESA_CONSUMER_SECRET")!;
const MPESA_SHORTCODE      = Deno.env.get("MPESA_SHORTCODE")!;
const MPESA_PASSKEY        = Deno.env.get("MPESA_PASSKEY")!;

const DARAJA_BASE = MPESA_ENV === "production"
  ? "https://api.safaricom.co.ke"
  : "https://sandbox.safaricom.co.ke";

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Helpers ───────────────────────────────────────────────────────────────────
function getTimestamp(): string {
  return new Date().toISOString().replace(/[-T:.Z]/g, "").slice(0, 14);
}

function getStkPassword(ts: string): string {
  const raw = MPESA_SHORTCODE + MPESA_PASSKEY + ts;
  return btoa(raw);
}

async function getDarajaToken(): Promise<string> {
  const creds = btoa(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`);
  const res = await fetch(`${DARAJA_BASE}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${creds}` },
  });
  const data = await res.json();
  return data.access_token;
}

async function queryStkStatus(checkoutRequestId: string, token: string) {
  const ts       = getTimestamp();
  const password = getStkPassword(ts);

  const res = await fetch(`${DARAJA_BASE}/mpesa/stkpushquery/v1/query`, {
    method: "POST",
    headers: {
      Authorization:  `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      BusinessShortCode: MPESA_SHORTCODE,
      Password:          password,
      Timestamp:         ts,
      CheckoutRequestID: checkoutRequestId,
    }),
  });
  return res.json();
}

// ── Main ──────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${SUPABASE_SERVICE_KEY}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Fetch stale pending transactions (DB view from migration 007)
  const { data: stale, error } = await sb
    .from("stale_pending_transactions")
    .select("id, checkout_request_id, invoice_id, amount_kes, phone, invoice_no");

  if (error) {
    console.error("Failed to fetch stale transactions:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  if (!stale?.length) {
    return new Response(JSON.stringify({ ok: true, reconciled: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  let token: string;
  try {
    token = await getDarajaToken();
  } catch (e) {
    console.error("Failed to get Daraja token:", e);
    return new Response(JSON.stringify({ error: "Daraja auth failed" }), { status: 500 });
  }

  let reconciled = 0;
  const results: Array<{ id: string; result: string }> = [];

  for (const txn of stale) {
    try {
      const queryResult = await queryStkStatus(txn.checkout_request_id, token);
      const resultCode  = parseInt(String(queryResult.ResultCode ?? "-1"), 10);

      let newStatus: "success" | "failed" | "timeout";
      if (resultCode === 0)    newStatus = "success";
      else if (resultCode === 1032) newStatus = "failed";   // cancelled by user
      else if (resultCode === 1037) newStatus = "timeout";  // timed out
      else                     newStatus = "failed";

      // Update transaction status
      await sb.from("mpesa_transactions").update({
        status:       newStatus,
        result_code:  resultCode,
        result_desc:  queryResult.ResultDesc ?? "Reconciled",
        completed_at: new Date().toISOString(),
      }).eq("id", txn.id);

      // If success, mark invoice paid and record payment
      if (newStatus === "success") {
        await sb.from("invoices")
          .update({ status: "paid", paid_at: new Date().toISOString() })
          .eq("id", txn.invoice_id);

        await sb.from("payments").insert({
          invoice_id: txn.invoice_id,
          amount_kes: txn.amount_kes,
          method:     "mpesa",
          paid_at:    new Date().toISOString(),
          notes:      "Reconciled via cron",
        });
      }

      results.push({ id: txn.id, result: newStatus });
      reconciled++;

    } catch (err) {
      console.error(`Failed to reconcile txn ${txn.id}:`, err);
      results.push({ id: txn.id, result: "error" });
    }

    // Respect Daraja rate limits — wait 500ms between queries
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`[reconcile-mpesa] Reconciled ${reconciled} transactions:`, results);

  return new Response(
    JSON.stringify({ ok: true, reconciled, results }),
    { headers: { "Content-Type": "application/json" } }
  );
});
