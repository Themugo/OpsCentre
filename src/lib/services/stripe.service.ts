// ─── Stripe Integration ───────────────────────────────────────────────────────
// Card payments for business customers and diaspora.
// Uses Stripe SDK for proper webhook signature verification.

import Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase";
import { notify } from "@/lib/notifications/notify.service";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY!;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

// Initialize Stripe SDK
const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2025-04-30.basil",
});

// ── Create Payment Intent ─────────────────────────────────────────────────────
export async function createStripePaymentIntent(
  invoiceId:    string,
  amountKes:    number,
  customerName: string,
  customerEmail?: string
): Promise<{ clientSecret: string; paymentIntentId: string }> {
  const intent = await stripe.paymentIntents.create({
    amount: Math.round(amountKes * 100), // KES has 2 decimal places in Stripe
    currency: "kes",
    description: `OpsCentre Invoice ${invoiceId}`,
    receipt_email: customerEmail || undefined,
    metadata: {
      invoice_id: invoiceId,
      customer: customerName,
    },
    automatic_payment_methods: {
      enabled: true,
    },
  });

  return {
    clientSecret: intent.client_secret!,
    paymentIntentId: intent.id,
  };
}

// ── Webhook handler with proper signature verification ────────────────────────
export async function handleStripeWebhook(
  rawBody: string,
  signature: string
): Promise<void> {
  if (!STRIPE_WEBHOOK_SECRET) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }

  // Verify webhook signature using Stripe SDK
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error("Stripe webhook signature verification failed:", err.message);
    throw new Error(`Webhook signature verification failed: ${err.message}`);
  }

  const sb = createServiceClient();

  switch (event.type) {
    case "payment_intent.succeeded": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const invoiceId = pi.metadata?.invoice_id;
      const amountKes = pi.amount / 100;

      if (!invoiceId) {
        console.warn("Payment succeeded but no invoice_id in metadata:", pi.id);
        break;
      }

      // Mark invoice paid
      const { error: invoiceError } = await sb
        .from("invoices")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", invoiceId);

      if (invoiceError) {
        console.error("Failed to update invoice:", invoiceError);
      }

      // Record payment
      const { error: paymentError } = await sb.from("payments").insert({
        invoice_id: invoiceId,
        amount_kes: amountKes,
        method: "stripe",
        stripe_ref: pi.id,
        paid_at: new Date().toISOString(),
      });

      if (paymentError) {
        console.error("Failed to record payment:", paymentError);
      }

      // Fetch customer for notification
      const { data: inv } = await sb
        .from("invoices")
        .select("invoice_no, subscriptions(customers(name, phone, email))")
        .eq("id", invoiceId)
        .single();

      const customer = (inv?.subscriptions as any)?.customers;
      if (customer) {
        notify
          .paymentReceived({
            customerName: customer.name,
            customerPhone: customer.phone,
            customerEmail: customer.email,
            amountKes,
            receiptNo: pi.id,
            invoiceNo: inv?.invoice_no,
          })
          .catch(console.error);
      }
      break;
    }

    case "payment_intent.payment_failed": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const invoiceId = pi.metadata?.invoice_id;
      if (!invoiceId) break;
      console.warn(
        `Stripe payment failed for invoice ${invoiceId}:`,
        pi.last_payment_error?.message
      );
      break;
    }

    default:
      console.log(`Unhandled Stripe event: ${event.type}`);
  }
}

// ── Retrieve Payment Intent status ────────────────────────────────────────────
export async function getPaymentIntentStatus(
  paymentIntentId: string
): Promise<{ status: string; amount: number }> {
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  return {
    status: pi.status,
    amount: pi.amount / 100,
  };
}
