// ─── Subscription Service ─────────────────────────────────────────────────────
// All subscription lifecycle operations: activate, suspend, upgrade,
// cancel, and mid-cycle proration calculations.

import { createServiceClient } from "@/lib/supabase";
import { addMonths, addQuarters, addYears, differenceInDays } from "date-fns";

const supabase = () => createServiceClient();

// ── Types ─────────────────────────────────────────────────────────────────────

export type BillingCycle = "monthly" | "quarterly" | "annual";
export type SubStatus    = "active" | "suspended" | "cancelled";

export interface ActivateParams {
  customerId:  string;
  planId:      string;
  startDate?:  Date;
}

export interface UpgradeParams {
  subscriptionId: string;
  newPlanId:      string;
  prorate?:       boolean;  // default true
}

export interface ServiceResult<T = void> {
  success: boolean;
  data?:   T;
  error?:  string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function nextBillingDate(from: Date, cycle: BillingCycle): Date {
  switch (cycle) {
    case "monthly":   return addMonths(from, 1);
    case "quarterly": return addQuarters(from, 1);
    case "annual":    return addYears(from, 1);
  }
}

/** Pro-rate credit for unused days in current billing period */
function prorateCredit(
  dailyRate: number,
  billingDate: Date,
  today: Date = new Date()
): number {
  const daysRemaining = differenceInDays(billingDate, today);
  return Math.max(0, Math.round(dailyRate * daysRemaining));
}

function dailyRate(priceKes: number, cycle: BillingCycle): number {
  const days = { monthly: 30, quarterly: 90, annual: 365 }[cycle];
  return priceKes / days;
}

// ── 1. Activate new subscription ──────────────────────────────────────────────

export async function activateSubscription(
  params: ActivateParams
): Promise<ServiceResult<{ subscriptionId: string; invoiceId: string }>> {
  const sb = supabase();
  const start = params.startDate ?? new Date();

  // Fetch plan
  const { data: plan, error: planErr } = await sb
    .from("service_plans")
    .select("id, name, price_kes, billing_cycle, type")
    .eq("id", params.planId)
    .eq("is_active", true)
    .single();

  if (planErr || !plan) {
    return { success: false, error: "Plan not found or inactive" };
  }

  const billing = plan.billing_cycle as BillingCycle;
  const nextDate = nextBillingDate(start, billing);

  // Create subscription
  const { data: sub, error: subErr } = await sb
    .from("subscriptions")
    .insert({
      customer_id:       params.customerId,
      plan_id:           params.planId,
      status:            "active",
      start_date:        start.toISOString().slice(0, 10),
      next_billing_date: nextDate.toISOString().slice(0, 10),
    })
    .select("id")
    .single();

  if (subErr || !sub) {
    return { success: false, error: subErr?.message ?? "Failed to create subscription" };
  }

  // Generate first invoice
  const { data: invoice, error: invErr } = await sb
    .from("invoices")
    .insert({
      subscription_id:      sub.id,
      amount_kes:           plan.price_kes,
      status:               "sent",
      billing_period_start: start.toISOString().slice(0, 10),
      billing_period_end:   nextDate.toISOString().slice(0, 10),
      due_date:             start.toISOString().slice(0, 10),
    })
    .select("id")
    .single();

  if (invErr || !invoice) {
    return { success: false, error: invErr?.message ?? "Failed to create invoice" };
  }

  return {
    success: true,
    data: { subscriptionId: sub.id, invoiceId: invoice.id },
  };
}

// ── 2. Suspend subscription ───────────────────────────────────────────────────

export async function suspendSubscription(
  subscriptionId: string,
  reason = "Non-payment"
): Promise<ServiceResult> {
  const sb = supabase();

  const { error } = await sb
    .from("subscriptions")
    .update({ status: "suspended" })
    .eq("id", subscriptionId)
    .eq("status", "active");

  if (error) return { success: false, error: error.message };

  // Update customer status if all subs are suspended/cancelled
  const { data: sub } = await sb
    .from("subscriptions")
    .select("customer_id")
    .eq("id", subscriptionId)
    .single();

  if (sub) {
    const { count } = await sb
      .from("subscriptions")
      .select("*", { count: "exact", head: true })
      .eq("customer_id", sub.customer_id)
      .eq("status", "active");

    if (count === 0) {
      await sb
        .from("customers")
        .update({ status: "suspended" })
        .eq("id", sub.customer_id);
    }
  }

  return { success: true };
}

// ── 3. Reactivate suspended subscription ─────────────────────────────────────

export async function reactivateSubscription(
  subscriptionId: string
): Promise<ServiceResult<{ invoiceId?: string }>> {
  const sb = supabase();

  const { data: sub, error: subErr } = await sb
    .from("subscriptions")
    .select("*, service_plans(price_kes, billing_cycle, name)")
    .eq("id", subscriptionId)
    .eq("status", "suspended")
    .single();

  if (subErr || !sub) {
    return { success: false, error: "Subscription not found or not suspended" };
  }

  const today = new Date();
  const billing = (sub.service_plans as any).billing_cycle as BillingCycle;
  const nextDate = nextBillingDate(today, billing);

  const { error } = await sb
    .from("subscriptions")
    .update({
      status:            "active",
      next_billing_date: nextDate.toISOString().slice(0, 10),
    })
    .eq("id", subscriptionId);

  if (error) return { success: false, error: error.message };

  // Reactivate customer record too
  await sb
    .from("customers")
    .update({ status: "active" })
    .eq("id", sub.customer_id);

  // Issue a reactivation invoice for the new period
  const { data: invoice } = await sb
    .from("invoices")
    .insert({
      subscription_id:      subscriptionId,
      amount_kes:           (sub.service_plans as any).price_kes,
      status:               "sent",
      billing_period_start: today.toISOString().slice(0, 10),
      billing_period_end:   nextDate.toISOString().slice(0, 10),
      due_date:             today.toISOString().slice(0, 10),
    })
    .select("id")
    .single();

  return { success: true, data: { invoiceId: invoice?.id } };
}

// ── 4. Upgrade / downgrade plan ───────────────────────────────────────────────

export async function changePlan(
  params: UpgradeParams
): Promise<ServiceResult<{ creditKes: number; newInvoiceId?: string }>> {
  const sb = supabase();
  const prorate = params.prorate !== false;

  // Fetch current subscription + old plan
  const { data: sub, error: subErr } = await sb
    .from("subscriptions")
    .select("*, service_plans(price_kes, billing_cycle, name)")
    .eq("id", params.subscriptionId)
    .eq("status", "active")
    .single();

  if (subErr || !sub) {
    return { success: false, error: "Active subscription not found" };
  }

  // Fetch new plan
  const { data: newPlan, error: planErr } = await sb
    .from("service_plans")
    .select("id, name, price_kes, billing_cycle")
    .eq("id", params.newPlanId)
    .eq("is_active", true)
    .single();

  if (planErr || !newPlan) {
    return { success: false, error: "New plan not found or inactive" };
  }

  const oldPlan    = sub.service_plans as any;
  const billing    = oldPlan.billing_cycle as BillingCycle;
  const today      = new Date();
  const billingEnd = new Date(sub.next_billing_date);

  // Calculate pro-rate credit for remaining days on old plan
  let creditKes = 0;
  if (prorate) {
    const rate   = dailyRate(oldPlan.price_kes, billing);
    creditKes    = prorateCredit(rate, billingEnd, today);
  }

  const newNextDate = nextBillingDate(today, newPlan.billing_cycle as BillingCycle);

  // Update subscription to new plan
  const { error: updateErr } = await sb
    .from("subscriptions")
    .update({
      plan_id:           params.newPlanId,
      next_billing_date: newNextDate.toISOString().slice(0, 10),
    })
    .eq("id", params.subscriptionId);

  if (updateErr) return { success: false, error: updateErr.message };

  // Issue new invoice (net of pro-rate credit)
  const chargeAmount = Math.max(0, newPlan.price_kes - creditKes);
  let newInvoiceId: string | undefined;

  if (chargeAmount > 0) {
    const { data: inv } = await sb
      .from("invoices")
      .insert({
        subscription_id:      params.subscriptionId,
        amount_kes:           chargeAmount,
        status:               "sent",
        notes:                prorate
          ? `Plan upgrade: ${oldPlan.name} → ${newPlan.name}. Credit applied: KES ${creditKes}`
          : `Plan change: ${oldPlan.name} → ${newPlan.name}`,
        billing_period_start: today.toISOString().slice(0, 10),
        billing_period_end:   newNextDate.toISOString().slice(0, 10),
        due_date:             today.toISOString().slice(0, 10),
      })
      .select("id")
      .single();

    newInvoiceId = inv?.id;
  }

  return { success: true, data: { creditKes, newInvoiceId } };
}

// ── 5. Cancel subscription ────────────────────────────────────────────────────

export async function cancelSubscription(
  subscriptionId: string,
  reason?: string
): Promise<ServiceResult> {
  const sb = supabase();

  const { error } = await sb
    .from("subscriptions")
    .update({ status: "cancelled" })
    .eq("id", subscriptionId)
    .in("status", ["active", "suspended"]);

  if (error) return { success: false, error: error.message };

  // Check if customer has any remaining active subscriptions
  const { data: sub } = await sb
    .from("subscriptions")
    .select("customer_id")
    .eq("id", subscriptionId)
    .single();

  if (sub) {
    const { count } = await sb
      .from("subscriptions")
      .select("*", { count: "exact", head: true })
      .eq("customer_id", sub.customer_id)
      .eq("status", "active");

    if (count === 0) {
      await sb
        .from("customers")
        .update({ status: "churned" })
        .eq("id", sub.customer_id);
    }
  }

  return { success: true };
}
