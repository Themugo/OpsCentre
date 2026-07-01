// ─── Notification Service ─────────────────────────────────────────────────────
// Sends SMS (Africa's Talking) and email (Resend) for key system events.
// All sends are fire-and-forget — failures are logged but never throw.

// ── Types ─────────────────────────────────────────────────────────────────────

export type NotifEvent =
  | "invoice_created"
  | "invoice_overdue"
  | "payment_received"
  | "subscription_suspended"
  | "subscription_activated"
  | "plan_upgraded"
  | "ticket_opened"
  | "ticket_resolved"
  | "field_job_scheduled"
  | "outage_alert"
  | "welcome";

interface NotifPayload {
  customerName:   string;
  customerPhone?: string;
  customerEmail?: string;
  invoiceNo?:     string;
  amountKes?:     number;
  planName?:      string;
  receiptNo?:     string;
  ticketNo?:      string;
  jobDate?:       string;
  nodeNames?:     string[];
  [key: string]:  unknown;
}

// ── SMS — Africa's Talking ────────────────────────────────────────────────────

const AT_API_URL = "https://api.africastalking.com/version1/messaging";

async function sendSMS(to: string, message: string): Promise<boolean> {
  const username = process.env.AFRICASTALKING_USERNAME ?? "sandbox";
  const apiKey   = process.env.AFRICASTALKING_API_KEY;

  if (!apiKey) {
    console.warn("[SMS] AFRICASTALKING_API_KEY not set — skipping SMS");
    return false;
  }

  // Normalise to +254XXXXXXXXX
  const phone = to.replace(/^0/, "+254").replace(/^254/, "+254");

  try {
    const res = await fetch(AT_API_URL, {
      method: "POST",
      headers: {
        Accept:         "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        apiKey,
      },
      body: new URLSearchParams({
        username,
        to:      phone,
        message: message.slice(0, 160),  // single SMS limit
      }),
    });

    const data = await res.json();
    const recipient = data?.SMSMessageData?.Recipients?.[0];

    if (recipient?.status === "Success") {
      console.log(`[SMS] Sent to ${phone}: ${recipient.statusCode}`);
      return true;
    }

    console.error("[SMS] Failed:", data);
    return false;
  } catch (err) {
    console.error("[SMS] Error:", err);
    return false;
  }
}

// ── Email — Resend ────────────────────────────────────────────────────────────

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_EMAIL     = process.env.RESEND_FROM_EMAIL ?? "noreply@fibercrm.co.ke";
const FROM_NAME      = process.env.RESEND_FROM_NAME  ?? "FiberCRM";

async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.warn("[Email] RESEND_API_KEY not set — skipping email");
    return false;
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization:  `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from:    `${FROM_NAME} <${FROM_EMAIL}>`,
        to:      [to],
        subject,
        html,
      }),
    });

    if (res.ok) {
      console.log(`[Email] Sent to ${to}: ${subject}`);
      return true;
    }

    console.error("[Email] Failed:", await res.text());
    return false;
  } catch (err) {
    console.error("[Email] Error:", err);
    return false;
  }
}

// ── Message templates ─────────────────────────────────────────────────────────

function smsTemplate(event: NotifEvent, p: NotifPayload): string {
  const kes = (n: number) => `KES ${n.toLocaleString("en-KE")}`;
  switch (event) {
    case "invoice_created":
      return `FiberCRM: Hi ${p.customerName}, your invoice ${p.invoiceNo} for ${kes(p.amountKes!)} is ready. Please pay to keep your connection active. Reply STOP to opt out.`;
    case "invoice_overdue":
      return `FiberCRM: REMINDER - Invoice ${p.invoiceNo} (${kes(p.amountKes!)}) is overdue. Pay now to avoid suspension. M-Pesa: ${process.env.MPESA_SHORTCODE ?? "123456"}. Acc: ${p.invoiceNo}.`;
    case "payment_received":
      return `FiberCRM: Payment confirmed! ${kes(p.amountKes!)} received. Receipt: ${p.receiptNo}. Thank you, ${p.customerName}.`;
    case "subscription_suspended":
      return `FiberCRM: Your ${p.planName} connection has been suspended due to non-payment. Pay ${p.invoiceNo} to reconnect. Call us: ${process.env.SUPPORT_PHONE ?? "0800 000 000"}.`;
    case "subscription_activated":
      return `FiberCRM: Welcome ${p.customerName}! Your ${p.planName} connection is now active. Enjoy fast fiber internet!`;
    case "plan_upgraded":
      return `FiberCRM: Your plan has been upgraded to ${p.planName}. Your new speeds are now active. Enjoy!`;
    case "ticket_opened":
      return `FiberCRM: Support ticket ${p.ticketNo} opened. Our team will respond within 24 hours. Track at portal.fibercrm.co.ke`;
    case "ticket_resolved":
      return `FiberCRM: Your ticket ${p.ticketNo} has been resolved. We hope your issue is fixed! Rate us at portal.fibercrm.co.ke`;
    case "field_job_scheduled":
      return `FiberCRM: A technician is scheduled to visit on ${p.jobDate}. Please ensure access to your premises. Call us if you need to reschedule.`;
    case "outage_alert":
      return `FiberCRM: We're aware of a network issue affecting ${p.nodeNames?.join(", ")}. Our team is working on a fix. We apologise for the inconvenience.`;
    case "welcome":
      return `FiberCRM: Welcome to FiberCRM, ${p.customerName}! Your account is active. Visit portal.fibercrm.co.ke to manage your connection.`;
    default:
      return `FiberCRM notification for ${p.customerName}.`;
  }
}

function emailTemplate(event: NotifEvent, p: NotifPayload): { subject: string; html: string } {
  const kes = (n: number) => `KES ${n.toLocaleString("en-KE")}`;
  const base = (title: string, body: string) => `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;">
      <div style="background:#1D9E75;border-radius:8px 8px 0 0;padding:20px 24px;">
        <span style="color:#fff;font-size:18px;font-weight:500;">FiberCRM</span>
      </div>
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:0 0 8px 8px;padding:28px 24px;">
        <h2 style="font-size:18px;font-weight:500;margin:0 0 16px;">${title}</h2>
        ${body}
        <hr style="border:none;border-top:1px solid #f3f4f6;margin:24px 0;">
        <p style="font-size:12px;color:#9ca3af;margin:0;">
          FiberCRM · Nairobi, Kenya · <a href="https://portal.fibercrm.co.ke">Customer portal</a>
        </p>
      </div>
    </div>`;

  switch (event) {
    case "invoice_created":
      return {
        subject: `Invoice ${p.invoiceNo} — ${kes(p.amountKes!)} due`,
        html: base("New invoice", `
          <p>Hi ${p.customerName},</p>
          <p>Your invoice <strong>${p.invoiceNo}</strong> for <strong>${kes(p.amountKes!)}</strong> is ready.</p>
          <div style="background:#f9fafb;border-radius:8px;padding:16px;margin:16px 0;">
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
              <span style="color:#6b7280;">Invoice number</span><span><strong>${p.invoiceNo}</strong></span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
              <span style="color:#6b7280;">Amount</span><span><strong>${kes(p.amountKes!)}</strong></span>
            </div>
            <div style="display:flex;justify-content:space-between;">
              <span style="color:#6b7280;">Plan</span><span>${p.planName}</span>
            </div>
          </div>
          <p><strong>Pay via M-Pesa:</strong> Paybill ${process.env.MPESA_SHORTCODE ?? "123456"} · Account: ${p.invoiceNo}</p>
          <a href="https://portal.fibercrm.co.ke/invoices" style="display:inline-block;background:#1D9E75;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:500;">Pay now</a>
        `),
      };
    case "payment_received":
      return {
        subject: `Payment confirmed — ${kes(p.amountKes!)} received`,
        html: base("Payment confirmed", `
          <p>Hi ${p.customerName}, thank you for your payment!</p>
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0;">
            <p style="margin:0;color:#166534;font-size:16px;font-weight:500;">✓ ${kes(p.amountKes!)} received</p>
            <p style="margin:8px 0 0;color:#166534;font-size:13px;">M-Pesa receipt: ${p.receiptNo}</p>
          </div>
          <a href="https://portal.fibercrm.co.ke/invoices" style="display:inline-block;background:#1D9E75;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:500;">View invoice</a>
        `),
      };
    default:
      return {
        subject: `FiberCRM notification`,
        html: base("FiberCRM", `<p>Hi ${p.customerName}, you have a notification from FiberCRM.</p>`),
      };
  }
}

// ── WhatsApp integration ──────────────────────────────────────────────────────
// Imported lazily so WhatsApp creds being absent doesn't break SMS/email

async function maybeWhatsApp(event: NotifEvent, payload: NotifPayload): Promise<void> {
  if (!process.env.WHATSAPP_PHONE_NUMBER_ID || !process.env.WHATSAPP_ACCESS_TOKEN) return;
  if (!payload.customerPhone) return;

  try {
    const wa = await import("@/lib/services/whatsapp.service");
    if (event === "payment_received" && payload.receiptNo && payload.amountKes) {
      await wa.sendPaymentReceiptWhatsApp({
        phone:        payload.customerPhone,
        customerName: payload.customerName,
        amountKes:    payload.amountKes,
        receiptNo:    payload.receiptNo,
      });
    } else if (event === "invoice_created" && payload.invoiceNo && payload.amountKes) {
      await wa.sendInvoiceWhatsApp({
        phone:        payload.customerPhone,
        customerName: payload.customerName,
        invoiceNo:    payload.invoiceNo,
        amountKes:    payload.amountKes,
        dueDate:      String(payload.dueDate ?? ""),
      });
    } else if (event === "outage_alert" && payload.nodeNames?.length) {
      await wa.sendOutageAlertWhatsApp({
        phone:        payload.customerPhone,
        customerName: payload.customerName,
        area:         payload.nodeNames[0],
      });
    } else if (event === "welcome" && payload.planName) {
      await wa.sendWelcomeWhatsApp({
        phone:        payload.customerPhone,
        customerName: payload.customerName,
        planName:     payload.planName,
      });
    }
  } catch (err) {
    console.warn("[WhatsApp] send skipped:", err);
  }
}

// ── Main dispatcher ───────────────────────────────────────────────────────────

export async function sendNotification(
  event:   NotifEvent,
  payload: NotifPayload
): Promise<void> {
  const smsText   = smsTemplate(event, payload);
  const emailData = emailTemplate(event, payload);

  const sends: Promise<unknown>[] = [];

  if (payload.customerPhone) {
    sends.push(sendSMS(payload.customerPhone, smsText));
    // WhatsApp runs in parallel for supported events
    sends.push(maybeWhatsApp(event, payload));
  }
  if (payload.customerEmail) {
    sends.push(sendEmail(payload.customerEmail, emailData.subject, emailData.html));
  }

  // Fire-and-forget — don't let notification failures break the main flow
  await Promise.allSettled(sends);
}

// ── Convenience wrappers ──────────────────────────────────────────────────────

export const notify = {
  invoiceCreated:           (p: NotifPayload) => sendNotification("invoice_created", p),
  invoiceOverdue:           (p: NotifPayload) => sendNotification("invoice_overdue", p),
  paymentReceived:          (p: NotifPayload) => sendNotification("payment_received", p),
  subscriptionSuspended:    (p: NotifPayload) => sendNotification("subscription_suspended", p),
  subscriptionActivated:    (p: NotifPayload) => sendNotification("subscription_activated", p),
  planUpgraded:             (p: NotifPayload) => sendNotification("plan_upgraded", p),
  ticketOpened:             (p: NotifPayload) => sendNotification("ticket_opened", p),
  ticketResolved:           (p: NotifPayload) => sendNotification("ticket_resolved", p),
  fieldJobScheduled:        (p: NotifPayload) => sendNotification("field_job_scheduled", p),
  outageAlert:              (p: NotifPayload) => sendNotification("outage_alert", p),
  welcome:                  (p: NotifPayload) => sendNotification("welcome", p),
};
