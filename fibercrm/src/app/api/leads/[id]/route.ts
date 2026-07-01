// ─── /api/leads/[id] ─────────────────────────────────────────────────────────
// GET   — single lead with activity log
// PATCH — update stage, assigned_to, notes, follow-up
// POST  ?action=convert — convert won lead to customer + subscription

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerComponentClient, createServiceClient } from "@/lib/supabase";
import { activateSubscription } from "@/lib/services/subscription.service";
import { notify } from "@/lib/notifications/notify.service";

const UpdateSchema = z.object({
  stage:           z.enum(["new","qualified","proposal","won","lost"]).optional(),
  assignedTo:      z.string().uuid().optional(),
  notes:           z.string().optional(),
  lostReason:      z.string().optional(),
  nextFollowUpAt:  z.string().datetime().optional(),
  monthlyValueKes: z.number().positive().optional(),
});

const ConvertSchema = z.object({
  planId:    z.string().uuid(),
  addressId: z.string().uuid().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data: lead, error } = await supabase
    .from("leads")
    .select(`
      *,
      service_plans(id, name, price_kes),
      users!leads_assigned_to_fkey(id, name),
      customers!leads_converted_customer_id_fkey(id, name),
      lead_activities(id, type, description, created_at,
        users!lead_activities_user_id_fkey(name)
      )
    `)
    .eq("id", params.id)
    .single();

  if (error) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  return NextResponse.json({ data: lead });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const sb = createServiceClient();

  // Fetch old stage to detect stage change
  const { data: old } = await sb
    .from("leads").select("stage, name").eq("id", params.id).single();

  const updateData: Record<string, unknown> = {};
  if (parsed.data.stage)           updateData.stage             = parsed.data.stage;
  if (parsed.data.assignedTo)      updateData.assigned_to       = parsed.data.assignedTo;
  if (parsed.data.notes !== undefined) updateData.notes         = parsed.data.notes;
  if (parsed.data.lostReason)      updateData.lost_reason       = parsed.data.lostReason;
  if (parsed.data.nextFollowUpAt)  updateData.next_follow_up_at = parsed.data.nextFollowUpAt;
  if (parsed.data.monthlyValueKes) updateData.monthly_value_kes = parsed.data.monthlyValueKes;

  const { data, error } = await sb
    .from("leads").update(updateData).eq("id", params.id)
    .select("id, name, stage").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Log stage change activity
  if (parsed.data.stage && old && parsed.data.stage !== old.stage) {
    await sb.from("lead_activities").insert({
      lead_id:     params.id,
      user_id:     session.user.id,
      type:        "stage_change",
      description: `Stage changed: ${old.stage} → ${parsed.data.stage}`,
    });
  }

  return NextResponse.json({ data });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const action = req.nextUrl.searchParams.get("action");
  if (action !== "convert") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = ConvertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const sb = createServiceClient();

  // Fetch lead
  const { data: lead } = await sb
    .from("leads")
    .select("id, name, phone, email, area, stage")
    .eq("id", params.id).single();

  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (lead.stage === "won") return NextResponse.json({ error: "Already converted" }, { status: 400 });

  // Create customer record
  const { data: customer, error: custErr } = await sb
    .from("customers")
    .insert({
      name:      lead.name,
      phone:     lead.phone,
      email:     lead.email,
      type:      "home",
      status:    "active",
      address_id: parsed.data.addressId,
    })
    .select("id").single();

  if (custErr || !customer) {
    return NextResponse.json({ error: custErr?.message ?? "Failed to create customer" }, { status: 500 });
  }

  // Activate subscription
  const subResult = await activateSubscription({
    customerId: customer.id,
    planId:     parsed.data.planId,
  });

  // Mark lead as won + link to customer
  await sb.from("leads").update({
    stage:                  "won",
    converted_customer_id:  customer.id,
    converted_at:           new Date().toISOString(),
  }).eq("id", params.id);

  // Log activity
  await sb.from("lead_activities").insert({
    lead_id:     params.id,
    user_id:     session.user.id,
    type:        "stage_change",
    description: `Converted to customer — subscription activated`,
  });

  // Send welcome SMS
  notify.welcome({
    customerName:  lead.name,
    customerPhone: lead.phone,
    customerEmail: lead.email,
  }).catch(console.error);

  return NextResponse.json({
    data: {
      customerId:     customer.id,
      subscriptionId: subResult.data?.subscriptionId,
      invoiceId:      subResult.data?.invoiceId,
    }
  }, { status: 201 });
}
