// ─── /api/whatsapp ────────────────────────────────────────────────────────────
// GET  — webhook verification (Meta requires this on setup)
// POST — incoming message webhook + manual send endpoint

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerComponentClient, createServiceClient } from "@/lib/supabase";
import {
  sendInvoiceWhatsApp,
  sendPaymentReceiptWhatsApp,
  sendTextWhatsApp,
} from "@/lib/services/whatsapp.service";

const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY ?? "fibercrm-verify";

// ── GET — webhook verification ────────────────────────────────────────────────
// Meta calls this once during webhook setup to verify the endpoint.
export async function GET(req: NextRequest) {
  const mode      = req.nextUrl.searchParams.get("hub.mode");
  const token     = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("[WhatsApp] Webhook verified");
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

// ── POST — incoming messages + manual send ────────────────────────────────────
const SendSchema = z.object({
  action:       z.enum(["send_invoice","send_receipt","send_text","send_outage"]),
  phone:        z.string(),
  customerName: z.string().optional(),
  invoiceNo:    z.string().optional(),
  amountKes:    z.number().optional(),
  receiptNo:    z.string().optional(),
  dueDate:      z.string().optional(),
  text:         z.string().optional(),
  area:         z.string().optional(),
});

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";

  // ── Incoming WhatsApp message from Meta ─────────────────────────────────
  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => null);

    // Check if it's a Meta webhook payload
    if (body?.object === "whatsapp_business_account") {
      await handleIncomingMessage(body);
      return NextResponse.json({ ok: true });
    }

    // Otherwise treat as a manual send request from staff
    const supabase = await createServerComponentClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const { data: user } = await supabase
      .from("users").select("role").eq("id", session.user.id).single();
    if (!user || !["admin","billing","support"].includes(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = SendSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
    }

    const d = parsed.data;
    let ok = false;

    switch (d.action) {
      case "send_invoice":
        ok = await sendInvoiceWhatsApp({
          phone:        d.phone,
          customerName: d.customerName ?? "Customer",
          invoiceNo:    d.invoiceNo    ?? "",
          amountKes:    d.amountKes    ?? 0,
          dueDate:      d.dueDate      ?? "",
        });
        break;

      case "send_receipt":
        ok = await sendPaymentReceiptWhatsApp({
          phone:        d.phone,
          customerName: d.customerName ?? "Customer",
          amountKes:    d.amountKes    ?? 0,
          receiptNo:    d.receiptNo    ?? "",
        });
        break;

      case "send_text":
        ok = await sendTextWhatsApp(d.phone, d.text ?? "");
        break;

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    return NextResponse.json({ ok, sent: ok });
  }

  return NextResponse.json({ error: "Unsupported content type" }, { status: 415 });
}

// ── Handle incoming WhatsApp messages ────────────────────────────────────────
async function handleIncomingMessage(payload: any): Promise<void> {
  const sb = createServiceClient();

  try {
    const entry   = payload.entry?.[0];
    const changes = entry?.changes?.[0];
    const value   = changes?.value;

    if (!value?.messages?.length) return;

    const message = value.messages[0];
    const contact = value.contacts?.[0];
    const from    = message.from; // phone number e.g. "254712345678"
    const text    = message.text?.body ?? "";
    const name    = contact?.profile?.name ?? "Customer";

    console.log(`[WhatsApp] Message from ${from} (${name}): ${text}`);

    // Find customer by phone
    const phone = from.startsWith("254") ? `0${from.slice(3)}` : from;
    const { data: customer } = await sb
      .from("customers")
      .select("id, name")
      .or(`phone.eq.${phone},phone.eq.+${from},phone.eq.${from}`)
      .single();

    if (!customer) {
      // Unknown number — log and move on
      console.log(`[WhatsApp] Unknown customer: ${from}`);
      return;
    }

    // Auto-create a support ticket for any inbound WhatsApp message
    const lowerText = text.toLowerCase();
    const category  =
      lowerText.includes("invoice") || lowerText.includes("payment") || lowerText.includes("bill")
        ? "billing"
        : lowerText.includes("internet") || lowerText.includes("slow") || lowerText.includes("down")
        ? "technical"
        : "general";

    await sb.from("support_tickets").insert({
      customer_id:  customer.id,
      category,
      priority:     "medium",
      subject:      `WhatsApp: ${text.slice(0, 80)}`,
      description:  `Received via WhatsApp from ${name} (${from}):\n\n${text}`,
      status:       "open",
    });

    console.log(`[WhatsApp] Auto-created ticket for customer ${customer.name}`);

  } catch (err) {
    console.error("[WhatsApp] handleIncomingMessage error:", err);
  }
}
