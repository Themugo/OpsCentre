// ─── /api/notifications ──────────────────────────────────────────────────────
// GET   — list notifications for the current user
// PATCH — mark notifications as read

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient, createServiceClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const limit  = parseInt(req.nextUrl.searchParams.get("limit") ?? "50");
  const unread = req.nextUrl.searchParams.get("unread") === "true";

  let query = supabase
    .from("notifications")
    .select("id, type, title, body, is_read, created_at, meta")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (unread) query = query.eq("is_read", false);

  const { data, error } = await query;

  // If table doesn't exist yet, return empty array gracefully
  if (error?.code === "42P01") {
    return NextResponse.json({ data: [], unreadCount: 0 });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const unreadCount = data?.filter(n => !n.is_read).length ?? 0;
  return NextResponse.json({ data, unreadCount });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const ids: string[] = body.ids ?? [];  // empty = mark all read

  const sb = createServiceClient();

  let query = sb
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", session.user.id);

  if (ids.length > 0) query = query.in("id", ids);

  const { error } = await query;
  if (error?.code === "42P01") return NextResponse.json({ ok: true }); // table doesn't exist yet
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
