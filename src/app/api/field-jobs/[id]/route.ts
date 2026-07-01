// ─── PATCH /api/field-jobs/[id] ───────────────────────────────────────────────
// Used by field technicians to update job status, checklist, photos, notes.
// Also used by dispatch to reassign technicians.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerComponentClient, createServiceClient } from "@/lib/supabase";

const UpdateSchema = z.object({
  status:          z.enum(["scheduled","en_route","in_progress","done","cancelled"]).optional(),
  technicianId:    z.string().uuid().optional(),
  notes:           z.string().optional(),
  resolutionNotes: z.string().optional(),
  checklist:       z.array(z.object({ label: z.string(), done: z.boolean() })).optional(),
  photos:          z.array(z.string().url()).optional(),
  signatureUrl:    z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data: user } = await supabase
    .from("users").select("role").eq("id", session.user.id).single();
  if (!user || !["admin", "support", "tech"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const sb = createServiceClient();
  const updateData: Record<string, unknown> = {};

  if (parsed.data.status)          updateData.status           = parsed.data.status;
  if (parsed.data.technicianId)    updateData.technician_id    = parsed.data.technicianId;
  if (parsed.data.notes)           updateData.notes            = parsed.data.notes;
  if (parsed.data.resolutionNotes) updateData.resolution_notes = parsed.data.resolutionNotes;
  if (parsed.data.checklist)       updateData.checklist        = parsed.data.checklist;
  if (parsed.data.photos)          updateData.photos           = parsed.data.photos;
  if (parsed.data.signatureUrl)    updateData.signature_url    = parsed.data.signatureUrl;

  const { data, error } = await sb
    .from("field_jobs")
    .update(updateData)
    .eq("id", params.id)
    .select("id, type, status, scheduled_at, completed_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data, error } = await supabase
    .from("field_jobs")
    .select(`
      id, type, status, priority, scheduled_at, started_at, completed_at,
      notes, resolution_notes, checklist, photos, signature_url,
      customers(id, name, phone, email),
      addresses(street, area, county, lat, lng),
      users!field_jobs_technician_id_fkey(id, name, phone)
    `)
    .eq("id", params.id)
    .single();

  if (error) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  return NextResponse.json({ data });
}
