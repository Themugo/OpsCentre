// ─── /api/users ──────────────────────────────────────────────────────────────
// GET    — list staff users (admin only)
// POST   — create new staff user
// PATCH  — update role / deactivate (via ?id=)

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerComponentClient, createServiceClient } from "@/lib/supabase";

const CreateUserSchema = z.object({
  name:     z.string().min(2).max(120),
  email:    z.string().email(),
  phone:    z.string().optional(),
  role:     z.enum(["admin","billing","sales","support","tech"]),
  password: z.string().min(8).optional(), // auto-generated if omitted
});

const UpdateUserSchema = z.object({
  name:      z.string().min(2).max(120).optional(),
  role:      z.enum(["admin","billing","sales","support","tech","customer"]).optional(),
  phone:     z.string().optional(),
  is_active: z.boolean().optional(),
});

async function requireAdmin(req: NextRequest) {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data: user } = await supabase
    .from("users").select("role").eq("id", session.user.id).single();
  if (!user || user.role !== "admin") return null;
  return session;
}

// ── GET — list staff ──────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data: caller } = await supabase
    .from("users").select("role").eq("id", session.user.id).single();
  if (!caller || caller.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const role = req.nextUrl.searchParams.get("role");

  let query = supabase
    .from("users")
    .select("id, name, email, phone, role, is_active, created_at")
    .neq("role", "customer")
    .order("role").order("name");

  if (role) query = query.eq("role", role);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// ── POST — create staff user ──────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = CreateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const sb = createServiceClient();
  const tempPassword = parsed.data.password
    ?? Math.random().toString(36).slice(-10) + "A1!";

  // Create auth user
  const { data: authData, error: authErr } = await sb.auth.admin.createUser({
    email:         parsed.data.email,
    password:      tempPassword,
    email_confirm: true,
    user_metadata: {
      name: parsed.data.name,
      role: parsed.data.role,
    },
  });

  if (authErr || !authData.user) {
    const msg = authErr?.message ?? "Failed to create user";
    if (msg.includes("already")) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Update the auto-created users row with correct role/name/phone
  await sb
    .from("users")
    .update({
      name:  parsed.data.name,
      role:  parsed.data.role,
      phone: parsed.data.phone,
    })
    .eq("id", authData.user.id);

  // Send password reset so they can set their own
  await sb.auth.admin.generateLink({
    type:  "recovery",
    email: parsed.data.email,
  });

  return NextResponse.json({
    data: {
      id:    authData.user.id,
      email: parsed.data.email,
      name:  parsed.data.name,
      role:  parsed.data.role,
    },
  }, { status: 201 });
}

// ── PATCH — update user ───────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const session = await requireAdmin(req);
  if (!session) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = UpdateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const sb = createServiceClient();
  const { data, error } = await sb
    .from("users")
    .update(parsed.data)
    .eq("id", id)
    .select("id, name, email, role, is_active")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// ── DELETE — deactivate user (soft delete) ────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const session = await requireAdmin(req);
  if (!session) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  // Prevent self-deletion
  if (id === session.user.id) {
    return NextResponse.json({ error: "Cannot deactivate your own account" }, { status: 400 });
  }

  const sb = createServiceClient();
  const { error } = await sb
    .from("users")
    .update({ is_active: false })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
