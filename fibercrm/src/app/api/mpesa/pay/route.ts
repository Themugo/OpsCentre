// ─── POST /api/mpesa/pay ──────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerComponentClient, createServiceClient } from "@/lib/supabase";
import { notify } from "@/lib/notifications/notify.service";

const PaySchema = z.object({
  invoiceId:     z.string().uuid(),
  invoiceNumber: z.string().min(1),
  phone:         z.string().regex(/^(\+?254|0)[17]\d{8}$/, "Invalid Kenyan phone"),
  amountKes:     z.number().positive().max(150_000),
});

// ── Daraja helpers ────────────────────────────────────────────────────────────
function getTimestamp(): string {
  return new Date().toISOString().replace(/[-T:.Z]/g, "").slice(0, 14);
}

function getStkPassword(shortcode: string, passkey: string, timestamp: string): string {
  return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");
}

function normalisePhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("254") && d.length === 12) return d;
  if (d.startsWith("0")   && d.length === 10) return `254${d.slice(1)}`;
  if (d.startsWith("7")   && d.length === 9)  return `254${d}`;
  throw new Error(`Cannot normalise phone: ${raw}`);
}

async function getDarajaToken(): Promise<string> {
  const env = process.env.MPESA_ENV === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";

  const creds = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  ).toString("base64");

  const res = await fetch(`${env}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${creds}` },
  });
  const data = await res.json();
  return data.access_token;
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = PaySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { invoiceId, invoiceNumber, phone, amountKes } = parsed.data;
  const sb = createServiceClient();

  // Validate invoice
  const { data: invoice } = await sb
    .from("invoices")
    .select("id, status, subscriptions(customers(name, phone, email))")
    .eq("id", invoiceId)
    .single();

  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  if (invoice.status === "paid") return NextResponse.json({ error: "Already paid" }, { status: 400 });

  // Check for recent pending transaction (debounce)
  const { data: existing } = await sb
    .from("mpesa_transactions")
    .select("id, initiated_at")
    .eq("invoice_id", invoiceId)
    .eq("status", "pending")
    .order("initiated_at", { ascending: false })
    .limit(1)
    .single();

  if (existing) {
    const age = Date.now() - new Date(existing.initiated_at).getTime();
    if (age < 90_000) {
      return NextResponse.json(
        { error: "Payment request already sent. Please wait for the M-Pesa prompt." },
        { status: 400 }
      );
    }
  }

  // STK Push
  const env = process.env.MPESA_ENV === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";

  const shortcode = process.env.MPESA_SHORTCODE!;
  const passkey   = process.env.MPESA_PASSKEY!;
  const timestamp = getTimestamp();
  const password  = getStkPassword(shortcode, passkey, timestamp);
  const appUrl    = process.env.NEXT_PUBLIC_APP_URL!;

  let stkResponse: any;
  try {
    const token = await getDarajaToken();
    const res = await fetch(`${env}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password:          password,
        Timestamp:         timestamp,
        TransactionType:   "CustomerPayBillOnline",
        Amount:            Math.round(amountKes),
        PartyA:            normalisePhone(phone),
        PartyB:            shortcode,
        PhoneNumber:       normalisePhone(phone),
        CallBackURL:       `${appUrl}/api/mpesa/callback/stk`,
        AccountReference:  invoiceNumber,
        TransactionDesc:   `FiberCRM ${invoiceNumber}`.slice(0, 13),
      }),
    });
    stkResponse = await res.json();
  } catch (err: any) {
    return NextResponse.json({ error: `STK Push failed: ${err.message}` }, { status: 500 });
  }

  if (stkResponse.errorCode) {
    return NextResponse.json(
      { error: `${stkResponse.errorMessage}` },
      { status: 400 }
    );
  }

  // Persist transaction
  await sb.from("mpesa_transactions").insert({
    invoice_id:           invoiceId,
    phone:                normalisePhone(phone),
    amount_kes:           amountKes,
    checkout_request_id:  stkResponse.CheckoutRequestID,
    merchant_request_id:  stkResponse.MerchantRequestID,
    status:               "pending",
    initiated_at:         new Date().toISOString(),
  });

  return NextResponse.json({
    checkoutRequestId: stkResponse.CheckoutRequestID,
    message:           stkResponse.CustomerMessage,
  });
}
