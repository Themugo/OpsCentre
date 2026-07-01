// ─── POST /api/stripe/webhook ─────────────────────────────────────────────────
// Receives Stripe webhook events (payment success/failure).
// Configure in Stripe dashboard: https://dashboard.stripe.com/webhooks

import { NextRequest, NextResponse } from "next/server";
import { handleStripeWebhook } from "@/lib/services/stripe.service";

export async function POST(req: NextRequest) {
  const rawBody  = await req.text();
  const signature = req.headers.get("stripe-signature") ?? "";

  try {
    await handleStripeWebhook(rawBody, signature);
    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("Stripe webhook error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

// Stripe requires raw body — disable Next.js body parsing
export const config = { api: { bodyParser: false } };
