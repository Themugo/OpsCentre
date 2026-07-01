// ─── POST /api/stripe/pay ─────────────────────────────────────────────────────
// Creates a Stripe Payment Intent for a given invoice.
// Returns clientSecret for use with Stripe.js on the frontend.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerComponentClient, createServiceClient } from "@/lib/supabase";
import { createStripePaymentIntent } from "@/lib/services/stripe.service";

const PaySchema = z.object({
  invoiceId: z.string().uuid(),
});

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

  const sb = createServiceClient();
  const { data: inv } = await sb
    .from("invoices")
    .select(`id, amount_kes, status,
      subscriptions(customers(name, email))`)
    .eq("id", parsed.data.invoiceId)
    .single();

  if (!inv) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  if (inv.status === "paid") return NextResponse.json({ error: "Already paid" }, { status: 400 });

  const customer = (inv.subscriptions as any)?.customers;

  try {
    const result = await createStripePaymentIntent(
      inv.id,
      inv.amount_kes,
      customer?.name ?? "Customer",
      customer?.email
    );
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
