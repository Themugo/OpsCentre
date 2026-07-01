// ─── C2B Callbacks ────────────────────────────────────────────────────────────
// /api/mpesa/callback/c2b/validate — Safaricom asks "should I accept?"
// /api/mpesa/callback/c2b/confirm  — Safaricom says "payment confirmed"
// Both must respond within 5 seconds.

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { notify } from "@/lib/notifications/notify.service";

interface C2BBody {
  TransactionType:   string;
  TransID:           string;
  TransTime:         string;
  TransAmount:       string;
  BusinessShortCode: string;
  BillRefNumber:     string;  // account number entered by customer = invoice_no
  InvoiceNumber:     string;
  OrgAccountBalance: string;
  ThirdPartyTransID: string;
  MSISDN:            string;  // customer phone
  FirstName:         string;
  MiddleName:        string;
  LastName:          string;
}

// ── Validation ────────────────────────────────────────────────────────────────
export async function POST_validate(req: NextRequest) {
  let body: C2BBody;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ResultCode: "C2B00011", ResultDesc: "Bad request" }); }

  const sb = createServiceClient();

  // Check the BillRefNumber matches a real unpaid invoice
  const { data: invoice } = await sb
    .from("invoices")
    .select("id, status, amount_kes")
    .eq("invoice_no", body.BillRefNumber)
    .single();

  if (!invoice) {
    console.warn(`C2B validate: invoice not found for ref=${body.BillRefNumber}`);
    return NextResponse.json({ ResultCode: "C2B00012", ResultDesc: "Invalid account number" });
  }

  if (invoice.status === "paid") {
    return NextResponse.json({ ResultCode: "C2B00016", ResultDesc: "Invoice already paid" });
  }

  // Check amount matches (allow overpayments — Safaricom rounds sometimes)
  const paidAmount = parseFloat(body.TransAmount);
  if (paidAmount < invoice.amount_kes * 0.99) {
    return NextResponse.json({ ResultCode: "C2B00013", ResultDesc: "Insufficient amount" });
  }

  return NextResponse.json({ ResultCode: "0", ResultDesc: "Accepted" });
}

// ── Confirmation ──────────────────────────────────────────────────────────────
export async function POST_confirm(req: NextRequest) {
  let body: C2BBody;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ResultCode: "0", ResultDesc: "Accepted" }); }

  console.log("[C2B confirm]", JSON.stringify(body));

  const sb     = createServiceClient();
  const amount = parseFloat(body.TransAmount);
  const phone  = body.MSISDN;
  const name   = [body.FirstName, body.MiddleName, body.LastName].filter(Boolean).join(" ");

  // Find invoice
  const { data: invoice } = await sb
    .from("invoices")
    .select("id, amount_kes, invoice_no, subscriptions(customers(name, email, phone))")
    .eq("invoice_no", body.BillRefNumber)
    .single();

  if (!invoice) {
    console.error("C2B confirm: invoice not found for ref", body.BillRefNumber);
    // Must still return 0 — money has been received
    return NextResponse.json({ ResultCode: "0", ResultDesc: "Accepted" });
  }

  // Record payment
  await sb.from("payments").insert({
    invoice_id: invoice.id,
    amount_kes: amount,
    method:     "mpesa",
    mpesa_ref:  body.TransID,
    paid_at:    new Date().toISOString(),
  });

  // Mark invoice paid if amount sufficient
  if (amount >= invoice.amount_kes) {
    await sb.from("invoices").update({
      status:  "paid",
      paid_at: new Date().toISOString(),
    }).eq("id", invoice.id);
  }

  // Notify customer
  const customer = (invoice.subscriptions as any)?.customers;
  notify.paymentReceived({
    customerName:  customer?.name ?? name,
    customerPhone: customer?.phone ?? phone,
    customerEmail: customer?.email,
    amountKes:     amount,
    receiptNo:     body.TransID,
    invoiceNo:     invoice.invoice_no,
  }).catch(console.error);

  // Must return 0 regardless — money is already transferred
  return NextResponse.json({ ResultCode: "0", ResultDesc: "Accepted" });
}

// Export both as POST (Next.js App Router — one file per route)
export { POST_confirm as POST };
