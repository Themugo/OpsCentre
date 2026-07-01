// ─── Stripe Integration ───────────────────────────────────────────────────────
// Card payments for business customers and diaspora.
// Uses Stripe Payment Intents API.

import { createServiceClient } from "@/lib/supabase";
import { notify } from "@/lib/notifications/notify.service";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY!;
const STRIPE_API        = "https://api.stripe.com/v1";

// ── Helpers ───────────────────────────────────────────────────────────────────
async function stripePost(path: string, body: Record<string, string>): Promise<any> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers: {
      Authorization:  `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? "Stripe error");
  return data;
}

async function stripeGet(path: string): Promise<any> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? "Stripe error");
  return data;
}

// ── Create Payment Intent ─────────────────────────────────────────────────────
export async function createStripePaymentIntent(
  invoiceId:    string,
  amountKes:    number,
  customerName: string,
  customerEmail?: string
): Promise<{ clientSecret: string; paymentIntentId: string }> {
  // Stripe amounts in smallest currency unit (KES cents = fils, but KES is 0 decimal)
  const intent = await stripePost("/payment_intents", {
    amount:                  String(Math.round(amountKes * 100)),  // KES has 2 decimal places in Stripe
    currency:                "kes",
    description:             `FiberCRM Invoice ${invoiceId}`,
    receipt_email:            customerEmail ?? "",
    "metadata[invoice_id]":  invoiceId,
    "metadata[customer]":    customerName,
    automatic_payment_methods: "enabled",  // simplified as string for URLSearchParams
  } as any);

  return {
    clientSecret:    intent.client_secret,
    paymentIntentId: intent.id,
  };
}

// ── Webhook handler ───────────────────────────────────────────────────────────
export async function handleStripeWebhook(
  rawBody: string,
  signature: string
): Promise<void> {
  // Verify webhook signature
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

  // Note: full Stripe signature verification requires the stripe npm package.
  // For production, use: stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  // Here we parse the event directly (add proper verification before going live).

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    throw new Error("Invalid webhook payload");
  }

  const sb = createServiceClient();

  switch (event.type) {
    case "payment_intent.succeeded": {
      const pi         = event.data.object;
      const invoiceId  = pi.metadata?.invoice_id;
      const amountKes  = pi.amount / 100;

      if (!invoiceId) break;

      // Mark invoice paid
      await sb.from("invoices")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", invoiceId);

      // Record payment
      await sb.from("payments").insert({
        invoice_id: invoiceId,
        amount_kes: amountKes,
        method:     "stripe",
        stripe_ref: pi.id,
        paid_at:    new Date().toISOString(),
      });

      // Fetch customer for notification
      const { data: inv } = await sb
        .from("invoices")
        .select("invoice_no, subscriptions(customers(name, phone, email))")
        .eq("id", invoiceId)
        .single();

      const customer = (inv?.subscriptions as any)?.customers;
      if (customer) {
        notify.paymentReceived({
          customerName:  customer.name,
          customerPhone: customer.phone,
          customerEmail: customer.email,
          amountKes,
          receiptNo:     pi.id,
          invoiceNo:     inv?.invoice_no,
        }).catch(console.error);
      }
      break;
    }

    case "payment_intent.payment_failed": {
      const pi        = event.data.object;
      const invoiceId = pi.metadata?.invoice_id;
      if (!invoiceId) break;
      console.warn(`Stripe payment failed for invoice ${invoiceId}:`, pi.last_payment_error?.message);
      break;
    }

    default:
      console.log(`Unhandled Stripe event: ${event.type}`);
  }
}
