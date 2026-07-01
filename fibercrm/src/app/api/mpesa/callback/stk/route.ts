// ─── POST /api/mpesa/callback/stk ─────────────────────────────────────────────
// Safaricom calls this after customer enters PIN. Must respond in < 5 seconds.

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { notify } from "@/lib/notifications/notify.service";

const SAFARICOM_IPS = new Set([
  "196.201.214.200","196.201.214.206","196.201.213.114",
  "196.201.214.207","196.201.214.208","196.201.213.44",
  "196.201.212.127","196.201.212.138","196.201.212.129",
  "196.201.212.136","196.201.212.74","196.201.212.69",
]);

export async function POST(req: NextRequest) {
  if (process.env.MPESA_ENFORCE_IP_ALLOWLIST === "true") {
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
    if (!SAFARICOM_IPS.has(ip)) {
      return NextResponse.json({ ResultCode: 1, ResultDesc: "Forbidden" }, { status: 403 });
    }
  }

  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ResultCode: 1, ResultDesc: "Bad request" }); }

  // Process async — respond immediately to Safaricom
  processCallback(body).catch(console.error);

  return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
}

async function processCallback(body: any) {
  const cb      = body?.Body?.stkCallback;
  if (!cb) return;

  const success    = cb.ResultCode === 0;
  const checkoutId = cb.CheckoutRequestID;
  const sb         = createServiceClient();

  // Find transaction
  const { data: txn } = await sb
    .from("mpesa_transactions")
    .select("id, invoice_id, amount_kes, phone")
    .eq("checkout_request_id", checkoutId)
    .single();

  if (!txn) { console.error("STK callback: txn not found", checkoutId); return; }

  const items = cb.CallbackMetadata?.Item ?? [];
  const get   = (name: string) => items.find((i: any) => i.Name === name)?.Value;

  const receipt     = get("MpesaReceiptNumber") as string | undefined;
  const amountPaid  = get("Amount")             as number | undefined;

  // Update transaction
  await sb.from("mpesa_transactions").update({
    status:       success ? "success" : "failed",
    mpesa_receipt: receipt,
    result_code:  cb.ResultCode,
    result_desc:  cb.ResultDesc,
    completed_at: new Date().toISOString(),
  }).eq("id", txn.id);

  if (success) {
    // Mark invoice paid + record payment
    await sb.from("invoices")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", txn.invoice_id);

    await sb.from("payments").insert({
      invoice_id: txn.invoice_id,
      amount_kes: amountPaid ?? txn.amount_kes,
      method:     "mpesa",
      mpesa_ref:  receipt,
      paid_at:    new Date().toISOString(),
    });

    // Fetch customer for notification
    const { data: inv } = await sb
      .from("invoices")
      .select("invoice_no, subscriptions(customers(name, phone, email))")
      .eq("id", txn.invoice_id)
      .single();

    const customer = (inv?.subscriptions as any)?.customers;
    if (customer) {
      notify.paymentReceived({
        customerName:  customer.name,
        customerPhone: customer.phone,
        customerEmail: customer.email,
        amountKes:     amountPaid ?? txn.amount_kes,
        receiptNo:     receipt,
        invoiceNo:     inv?.invoice_no,
      }).catch(console.error);
    }
  }
}
