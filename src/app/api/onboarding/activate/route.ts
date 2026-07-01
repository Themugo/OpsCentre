// ─── POST /api/onboarding/activate ───────────────────────────────────────────
// The final onboarding step. Does everything in one transaction:
//   1. Create Supabase auth user
//   2. Create address record
//   3. Create customer record
//   4. Activate subscription
//   5. Generate first invoice
//   6. Schedule installation field job
//   7. Send welcome SMS + email
//   8. Create portal notification

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase";
import { activateSubscription } from "@/lib/services/subscription.service";
import { notify } from "@/lib/notifications/notify.service";

const ActivateSchema = z.object({
  name:     z.string().min(2).max(120),
  email:    z.string().email(),
  phone:    z.string().regex(/^(\+?254|0)[17]\d{8}$/, "Invalid phone"),
  password: z.string().min(8),
  planId:   z.string().uuid(),
  address: z.object({
    street: z.string().min(2),
    area:   z.string().min(2),
    county: z.string().default("Nairobi"),
  }),
  idNumber: z.string().optional(),
  zoneId:   z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = ActivateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const d  = parsed.data;
  const sb = createServiceClient();

  // ── 1. Create Supabase auth user ──────────────────────────────────────────
  const { data: authData, error: authErr } = await sb.auth.admin.createUser({
    email:         d.email,
    password:      d.password,
    email_confirm: true,
    user_metadata: { name: d.name, phone: d.phone, role: "customer" },
  });

  if (authErr || !authData.user) {
    const msg = authErr?.message ?? "Failed to create account";
    // Handle duplicate email
    if (msg.includes("already") || msg.includes("duplicate")) {
      return NextResponse.json(
        { error: "An account with this email already exists. Please sign in instead." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const userId = authData.user.id;

  try {
    // ── 2. Create address ───────────────────────────────────────────────────
    const { data: address, error: addrErr } = await sb
      .from("addresses")
      .insert({
        street:           d.address.street,
        area:             d.address.area,
        county:           d.address.county,
        coverage_zone_id: d.zoneId ?? null,
      })
      .select("id")
      .single();

    if (addrErr) throw new Error(addrErr.message);

    // ── 3. Create customer record ───────────────────────────────────────────
    const { data: customer, error: custErr } = await sb
      .from("customers")
      .insert({
        id:         userId,          // links to auth.users
        name:       d.name,
        email:      d.email,
        phone:      d.phone,
        type:       "home",
        status:     "active",
        address_id: address.id,
      })
      .select("id")
      .single();

    if (custErr) throw new Error(custErr.message);

    // Update users table with correct role + name (trigger may have set defaults)
    await sb
      .from("users")
      .update({ name: d.name, role: "customer" })
      .eq("id", userId);

    // ── 4. Activate subscription ────────────────────────────────────────────
    const subResult = await activateSubscription({
      customerId: customer.id,
      planId:     d.planId,
    });

    if (!subResult.success) {
      throw new Error(subResult.error ?? "Subscription activation failed");
    }

    // ── 5. Fetch plan details for notification ──────────────────────────────
    const { data: plan } = await sb
      .from("service_plans")
      .select("name, price_kes")
      .eq("id", d.planId)
      .single();

    // ── 6. Schedule installation field job ──────────────────────────────────
    // Schedule 2 business days from now (rough estimate)
    const installDate = new Date();
    installDate.setDate(installDate.getDate() + 2);
    // Skip weekends
    if (installDate.getDay() === 0) installDate.setDate(installDate.getDate() + 1);
    if (installDate.getDay() === 6) installDate.setDate(installDate.getDate() + 2);
    installDate.setHours(9, 0, 0, 0);

    await sb.from("field_jobs").insert({
      type:        "installation",
      customer_id: customer.id,
      address_id:  address.id,
      status:      "scheduled",
      priority:    "medium",
      scheduled_at: installDate.toISOString(),
      notes:       `New onboarding installation — ${plan?.name ?? d.planId}. Customer: ${d.phone}`,
    });

    // ── 7. Send welcome SMS + email ─────────────────────────────────────────
    notify.welcome({
      customerName:  d.name,
      customerPhone: d.phone,
      customerEmail: d.email,
      planName:      plan?.name,
    }).catch(console.error);

    // Also send subscription activated notification
    notify.subscriptionActivated({
      customerName:  d.name,
      customerPhone: d.phone,
      customerEmail: d.email,
      planName:      plan?.name ?? "Fiber plan",
    }).catch(console.error);

    // ── 8. Push in-app notification ─────────────────────────────────────────
    await sb.rpc("push_notification", {
      p_user_id: userId,
      p_type:    "general",
      p_title:   "Welcome to FiberCRM! 🎉",
      p_body:    `Your ${plan?.name ?? "fiber"} plan is active. Our team will contact you within 24 hours to schedule your free installation.`,
      p_meta:    { subscription_id: subResult.data?.subscriptionId },
    }).catch(console.error);

    return NextResponse.json({
      success:        true,
      customerId:     customer.id,
      subscriptionId: subResult.data?.subscriptionId,
      invoiceId:      subResult.data?.invoiceId,
      installDate:    installDate.toISOString(),
      message:        `Welcome ${d.name}! Your ${plan?.name ?? "fiber"} connection is being set up.`,
    }, { status: 201 });

  } catch (err: any) {
    // Rollback: delete the auth user if anything failed
    await sb.auth.admin.deleteUser(userId).catch(console.error);
    console.error("[onboarding/activate] failed:", err);
    return NextResponse.json(
      { error: err.message ?? "Activation failed. Please try again." },
      { status: 500 }
    );
  }
}
