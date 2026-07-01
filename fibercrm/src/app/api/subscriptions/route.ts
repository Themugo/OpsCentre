// ─── POST /api/subscriptions ──────────────────────────────────────────────────
// Subscription lifecycle endpoint. Action is passed in the request body.
// Actions: activate | suspend | reactivate | upgrade | cancel

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerComponentClient } from "@/lib/supabase";
import {
  activateSubscription,
  suspendSubscription,
  reactivateSubscription,
  changePlan,
  cancelSubscription,
} from "@/lib/services/subscription.service";

// ── Schemas ───────────────────────────────────────────────────────────────────
const ActivateSchema = z.object({
  action:     z.literal("activate"),
  customerId: z.string().uuid(),
  planId:     z.string().uuid(),
  startDate:  z.string().optional(),
});

const SuspendSchema = z.object({
  action:         z.literal("suspend"),
  subscriptionId: z.string().uuid(),
  reason:         z.string().optional(),
});

const ReactivateSchema = z.object({
  action:         z.literal("reactivate"),
  subscriptionId: z.string().uuid(),
});

const UpgradeSchema = z.object({
  action:         z.literal("upgrade"),
  subscriptionId: z.string().uuid(),
  newPlanId:      z.string().uuid(),
  prorate:        z.boolean().optional(),
});

const CancelSchema = z.object({
  action:         z.literal("cancel"),
  subscriptionId: z.string().uuid(),
  reason:         z.string().optional(),
});

const BodySchema = z.discriminatedUnion("action", [
  ActivateSchema,
  SuspendSchema,
  ReactivateSchema,
  UpgradeSchema,
  CancelSchema,
]);

// ── Auth helper ───────────────────────────────────────────────────────────────
async function requireRole(roles: string[]) {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { data: user } = await supabase
    .from("users")
    .select("role")
    .eq("id", session.user.id)
    .single();

  if (!user || !roles.includes(user.role)) return null;
  return user;
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const user = await requireRole(["admin", "billing"]);
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const data = parsed.data;

  switch (data.action) {
    case "activate": {
      const result = await activateSubscription({
        customerId: data.customerId,
        planId:     data.planId,
        startDate:  data.startDate ? new Date(data.startDate) : undefined,
      });
      return NextResponse.json(result, { status: result.success ? 200 : 400 });
    }
    case "suspend": {
      const result = await suspendSubscription(data.subscriptionId, data.reason);
      return NextResponse.json(result, { status: result.success ? 200 : 400 });
    }
    case "reactivate": {
      const result = await reactivateSubscription(data.subscriptionId);
      return NextResponse.json(result, { status: result.success ? 200 : 400 });
    }
    case "upgrade": {
      const result = await changePlan({
        subscriptionId: data.subscriptionId,
        newPlanId:      data.newPlanId,
        prorate:        data.prorate,
      });
      return NextResponse.json(result, { status: result.success ? 200 : 400 });
    }
    case "cancel": {
      const result = await cancelSubscription(data.subscriptionId, data.reason);
      return NextResponse.json(result, { status: result.success ? 200 : 400 });
    }
  }
}

// ── GET /api/subscriptions?customerId=xxx ─────────────────────────────────────
export async function GET(req: NextRequest) {
  const user = await requireRole(["admin", "billing", "support", "sales"]);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const customerId = req.nextUrl.searchParams.get("customerId");
  if (!customerId) {
    return NextResponse.json({ error: "customerId required" }, { status: 400 });
  }

  const supabase = await createServerComponentClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select(`
      id, status, start_date, next_billing_date, static_ip,
      service_plans(id, name, type, price_kes, speed_down_mbps, speed_up_mbps, billing_cycle)
    `)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
