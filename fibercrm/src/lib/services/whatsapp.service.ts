// ─── WhatsApp Business API Service ───────────────────────────────────────────
// Sends WhatsApp messages via the Meta Cloud API (WhatsApp Business Platform).
// Supports: text messages, template messages (for transactional notifications),
// and interactive buttons.
//
// Setup:
//   1. Create a Meta Business app at developers.facebook.com
//   2. Add WhatsApp product → get Phone Number ID + Access Token
//   3. Register a WhatsApp Business number
//   4. Create message templates in Meta Business Manager (approved ~24h)
//
// Env vars required:
//   WHATSAPP_PHONE_NUMBER_ID   — from Meta dashboard
//   WHATSAPP_ACCESS_TOKEN      — permanent system user token
//   WHATSAPP_WEBHOOK_VERIFY    — any string you choose for webhook verification

const WA_BASE         = "https://graph.facebook.com/v19.0";
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";
const ACCESS_TOKEN    = process.env.WHATSAPP_ACCESS_TOKEN    ?? "";

// ── Types ─────────────────────────────────────────────────────────────────────

interface WATextMessage {
  type:    "text";
  to:      string;
  text:    string;
}

interface WATemplateMessage {
  type:       "template";
  to:         string;
  template:   string;          // template name registered in Meta Business Manager
  language:   string;          // e.g. "en_US" or "sw" (Swahili)
  components?: WAComponent[];
}

interface WAComponent {
  type:       "header" | "body" | "button";
  parameters: WAParameter[];
}

interface WAParameter {
  type: "text" | "currency" | "date_time";
  text?: string;
  currency?: { code: string; amount_1000: number };
}

type WAMessage = WATextMessage | WATemplateMessage;

// ── Core send function ────────────────────────────────────────────────────────

async function sendWhatsApp(msg: WAMessage): Promise<boolean> {
  if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
    console.warn("[WhatsApp] WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN not set — skipping");
    return false;
  }

  // Normalise to international format
  const to = msg.to.replace(/^0/, "254").replace(/^\+/, "");

  let payload: Record<string, unknown>;

  if (msg.type === "text") {
    payload = {
      messaging_product: "whatsapp",
      recipient_type:    "individual",
      to,
      type:              "text",
      text:              { preview_url: false, body: msg.text },
    };
  } else {
    payload = {
      messaging_product: "whatsapp",
      recipient_type:    "individual",
      to,
      type:              "template",
      template: {
        name:       msg.template,
        language:   { code: msg.language },
        components: msg.components ?? [],
      },
    };
  }

  try {
    const res = await fetch(`${WA_BASE}/${PHONE_NUMBER_ID}/messages`, {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("[WhatsApp] Send failed:", data?.error?.message ?? data);
      return false;
    }

    console.log(`[WhatsApp] Sent to ${to}:`, data.messages?.[0]?.id);
    return true;
  } catch (err) {
    console.error("[WhatsApp] Network error:", err);
    return false;
  }
}

// ── Notification helpers ──────────────────────────────────────────────────────

/**
 * Sends an invoice notification via WhatsApp.
 * Uses the "invoice_ready" template (must be approved in Meta Business Manager).
 * Template example:
 *   "Hello {{1}}, your FiberCRM invoice {{2}} for {{3}} is ready.
 *    Pay via M-Pesa Paybill {{4}}, Acc: {{2}}."
 */
export async function sendInvoiceWhatsApp(params: {
  phone:         string;
  customerName:  string;
  invoiceNo:     string;
  amountKes:     number;
  dueDate:       string;
}): Promise<boolean> {
  return sendWhatsApp({
    type:     "template",
    to:       params.phone,
    template: "invoice_ready",
    language: "en_US",
    components: [{
      type: "body",
      parameters: [
        { type: "text", text: params.customerName.split(" ")[0] },
        { type: "text", text: params.invoiceNo },
        { type: "text", text: `KES ${params.amountKes.toLocaleString("en-KE")}` },
        { type: "text", text: process.env.MPESA_SHORTCODE ?? "174379" },
        { type: "text", text: params.dueDate },
      ],
    }],
  });
}

/**
 * Sends a payment receipt via WhatsApp.
 * Template: "Hi {{1}}, we received your payment of {{2}}. Receipt: {{3}}. Thank you!"
 */
export async function sendPaymentReceiptWhatsApp(params: {
  phone:        string;
  customerName: string;
  amountKes:    number;
  receiptNo:    string;
}): Promise<boolean> {
  return sendWhatsApp({
    type:     "template",
    to:       params.phone,
    template: "payment_received",
    language: "en_US",
    components: [{
      type: "body",
      parameters: [
        { type: "text", text: params.customerName.split(" ")[0] },
        { type: "text", text: `KES ${params.amountKes.toLocaleString("en-KE")}` },
        { type: "text", text: params.receiptNo },
      ],
    }],
  });
}

/**
 * Sends a service outage alert via WhatsApp.
 * Template: "Hi {{1}}, we are aware of a network issue affecting {{2}}.
 *    Our team is working to resolve this. We apologise for the inconvenience."
 */
export async function sendOutageAlertWhatsApp(params: {
  phone:        string;
  customerName: string;
  area:         string;
}): Promise<boolean> {
  return sendWhatsApp({
    type:     "template",
    to:       params.phone,
    template: "outage_alert",
    language: "en_US",
    components: [{
      type: "body",
      parameters: [
        { type: "text", text: params.customerName.split(" ")[0] },
        { type: "text", text: params.area },
      ],
    }],
  });
}

/**
 * Sends a plain text WhatsApp message.
 * Only use for session messages (within 24h of customer contact).
 * For outbound, always use approved templates.
 */
export async function sendTextWhatsApp(phone: string, text: string): Promise<boolean> {
  return sendWhatsApp({ type: "text", to: phone, text });
}

/**
 * Sends a welcome message to a new customer.
 * Template: "Welcome to FiberCRM, {{1}}! Your {{2}} connection is active.
 *    Manage your account at portal.fibercrm.co.ke"
 */
export async function sendWelcomeWhatsApp(params: {
  phone:        string;
  customerName: string;
  planName:     string;
}): Promise<boolean> {
  return sendWhatsApp({
    type:     "template",
    to:       params.phone,
    template: "welcome_customer",
    language: "en_US",
    components: [{
      type: "body",
      parameters: [
        { type: "text", text: params.customerName.split(" ")[0] },
        { type: "text", text: params.planName },
      ],
    }],
  });
}

// ── Bulk WhatsApp broadcast ───────────────────────────────────────────────────

export async function sendBulkWhatsApp(
  recipients: Array<{ phone: string; name: string }>,
  template:   string,
  language:   string,
  getComponents: (name: string) => WAComponent[]
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  const DELAY = 100; // 100ms between sends to avoid rate limiting

  for (const r of recipients) {
    const ok = await sendWhatsApp({
      type:       "template",
      to:         r.phone,
      template,
      language,
      components: getComponents(r.name),
    });

    if (ok) sent++;
    else failed++;

    // Rate limit — Meta allows ~80 msgs/sec on standard tier
    await new Promise(resolve => setTimeout(resolve, DELAY));
  }

  return { sent, failed };
}
