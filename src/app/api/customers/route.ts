// ─── /api/customers ───────────────────────────────────────────────────────────
// GET  — list/search customers
// POST — create new customer + optional immediate subscription

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerComponentClient, createServiceClient } from "@/lib/supabase";
import { activateSubscription } from "@/lib/services/subscription.service";

// ── Schemas ───────────────────────────────────────────────────────────────────
const CreateCustomerSchema = z.object({
  name:    z.string().min(2).max(120),
  email:   z.string().email().optional(),
  phone:   z.string().regex(/^(\+?254|0)[17]\d{8}$/, "Invalid Kenyan phone"),
  type:    z.enum(["home", "business", "estate"]),
  address: z.object({
    street:  z.string().min(2),
    area:    z.string().min(2),
    county:  z.string().min(2),
    lat:     z.number().optional(),
    lng:     z.number().optional(),
  }).optional(),
  planId: z.string().uuid().optional(),  // auto-activate on create
});

// ── Auth ──────────────────────────────────────────────────────────────────────
async function getSession() {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

// ── GET — list customers ──────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const search  = searchParams.get("search") ?? "";
  const type    = searchParams.get("type");
  const status  = searchParams.get("status");
  const page    = parseInt(searchParams.get("page") ?? "1", 10);
  const limit   = parseInt(searchParams.get("limit") ?? "50", 10);
  const offset  = (page - 1) * limit;

  const supabase = await createServerComponentClient();

  let query = supabase
    .from("customers")
    .select(`
      id, name, email, phone, type, status, created_at,
      addresses(area, county),
      subscriptions(
        id, status,
        service_plans(name, price_kes, speed_down_mbps)
      )
    `, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.or(
      `name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`
    );
  }
  if (type)   query = query.eq("type", type);
  if (status) query = query.eq("status", status);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    data,
    meta: { total: count, page, limit, pages: Math.ceil((count ?? 0) / limit) },
  });
}

// ── POST — create customer ────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const supabase = await createServerComponentClient();

  // Check role
  const { data: staffUser } = await supabase
    .from("users")
    .select("role")
    .eq("id", session.user.id)
    .single();

  if (!staffUser || !["admin", "billing", "sales"].includes(staffUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = CreateCustomerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const sb = createServiceClient();
  const { name, email, phone, type, address, planId } = parsed.data;

  // Create address first (if provided)
  let addressId: string | null = null;
  if (address) {
    const { data: addr, error: addrErr } = await sb
      .from("addresses")
      .insert({ ...address })
      .select("id")
      .single();

    if (addrErr) return NextResponse.json({ error: addrErr.message }, { status: 500 });
    addressId = addr.id;
  }

  // Create customer
  const { data: customer, error: custErr } = await sb
    .from("customers")
    .insert({ name, email, phone, type, status: "active", address_id: addressId })
    .select("id, name, email, phone, type, status")
    .single();

  if (custErr || !customer) {
    return NextResponse.json({ error: custErr?.message ?? "Failed to create customer" }, { status: 500 });
  }

  // Auto-activate subscription if planId provided
  let subscriptionData;
  if (planId) {
    const subResult = await activateSubscription({ customerId: customer.id, planId });
    if (subResult.success) {
      subscriptionData = subResult.data;
    }
  }

  return NextResponse.json({ data: { customer, subscription: subscriptionData } }, { status: 201 });
}
