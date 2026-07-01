// ─── PDF Invoice Generator ────────────────────────────────────────────────────
// Generates a branded HTML invoice rendered to PDF via @react-pdf/renderer
// or (simpler) returns a styled HTML string that the browser prints.
// Used by: portal PDF download button, billing team invoice send.
//
// We use a pure HTML approach (no headless browser needed) —
// the client opens a new window and triggers window.print().
// For server-side PDF generation, install: npm i puppeteer-core

import { createServiceClient } from "@/lib/supabase";
import { formatKES, formatDate } from "@/lib/utils";

export interface InvoicePDFData {
  invoiceNo:       string;
  issueDate:       string;
  dueDate:         string;
  paidAt?:         string;
  status:          string;
  billingPeriod?:  string;

  customerName:    string;
  customerEmail?:  string;
  customerPhone?:  string;
  customerAddress?: string;

  planName:        string;
  speedDown:       number;
  speedUp:         number;

  amountKes:       number;
  payments?:       Array<{ method: string; mpesaRef?: string; amountKes: number; paidAt: string }>;
}

// ── Fetch invoice data ────────────────────────────────────────────────────────
export async function getInvoicePDFData(invoiceId: string): Promise<InvoicePDFData | null> {
  const sb = createServiceClient();

  const { data: inv, error } = await sb
    .from("invoices")
    .select(`
      id, invoice_no, amount_kes, status, due_date, paid_at, created_at,
      billing_period_start, billing_period_end, notes,
      subscriptions(
        service_plans(name, speed_down_mbps, speed_up_mbps),
        customers(name, email, phone,
          addresses(street, area, county)
        )
      ),
      payments(amount_kes, method, mpesa_ref, paid_at)
    `)
    .eq("id", invoiceId)
    .single();

  if (error || !inv) return null;

  const sub      = inv.subscriptions as any;
  const plan     = sub?.service_plans as any;
  const customer = sub?.customers as any;
  const address  = customer?.addresses as any;

  return {
    invoiceNo:      inv.invoice_no,
    issueDate:      formatDate(inv.created_at),
    dueDate:        formatDate(inv.due_date),
    paidAt:         inv.paid_at ? formatDate(inv.paid_at) : undefined,
    status:         inv.status,
    billingPeriod:  inv.billing_period_start && inv.billing_period_end
      ? `${formatDate(inv.billing_period_start)} – ${formatDate(inv.billing_period_end)}`
      : undefined,

    customerName:    customer?.name ?? "—",
    customerEmail:   customer?.email,
    customerPhone:   customer?.phone,
    customerAddress: address
      ? [address.street, address.area, address.county].filter(Boolean).join(", ")
      : undefined,

    planName:   plan?.name ?? "—",
    speedDown:  plan?.speed_down_mbps ?? 0,
    speedUp:    plan?.speed_up_mbps   ?? 0,
    amountKes:  inv.amount_kes,
    payments:   (inv.payments as any[])?.map(p => ({
      method:    p.method,
      mpesaRef:  p.mpesa_ref,
      amountKes: p.amount_kes,
      paidAt:    formatDate(p.paid_at),
    })),
  };
}

// ── Generate print-ready HTML ─────────────────────────────────────────────────
export function generateInvoiceHTML(d: InvoicePDFData): string {
  const isPaid    = d.status === "paid";
  const totalPaid = d.payments?.reduce((s, p) => s + p.amountKes, 0) ?? 0;
  const balance   = d.amountKes - totalPaid;

  const paymentRows = d.payments?.map(p => `
    <tr>
      <td>${p.paidAt}</td>
      <td style="text-transform:capitalize">${p.method}</td>
      <td>${p.mpesaRef ?? "—"}</td>
      <td style="text-align:right;font-weight:600;color:#166534">${formatKES(p.amountKes)}</td>
    </tr>
  `).join("") ?? "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Invoice ${d.invoiceNo}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #111827; background: #fff; padding: 40px; max-width: 760px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
    .logo { display: flex; align-items: center; gap: 12px; }
    .logo-icon { width: 44px; height: 44px; border-radius: 10px; background: #1D9E75; display: flex; align-items: center; justify-content: center; color: white; font-weight: 700; font-size: 16px; }
    .logo-name { font-size: 20px; font-weight: 700; color: #111827; }
    .logo-sub  { font-size: 12px; color: #6b7280; }
    .invoice-meta { text-align: right; }
    .invoice-no { font-size: 22px; font-weight: 700; color: #111827; }
    .status-badge { display: inline-block; padding: 3px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-top: 6px;
      background: ${isPaid ? "#dcfce7" : "#fef3c7"}; color: ${isPaid ? "#166534" : "#92400e"}; }
    .divider { border: none; border-top: 1px solid #e5e7eb; margin: 24px 0; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 32px; }
    .section-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: #9ca3af; margin-bottom: 8px; }
    .detail-row { display: flex; justify-content: space-between; font-size: 13px; padding: 4px 0; border-bottom: 1px solid #f9fafb; }
    .detail-label { color: #6b7280; }
    .detail-value { font-weight: 500; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; }
    th { text-align: left; padding: 8px 12px; background: #f9fafb; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; }
    td { padding: 10px 12px; border-bottom: 1px solid #f3f4f6; }
    .amount-box { background: #f9fafb; border-radius: 12px; padding: 20px; margin-top: 16px; }
    .amount-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 14px; }
    .amount-total { display: flex; justify-content: space-between; padding-top: 12px; margin-top: 12px; border-top: 2px solid #e5e7eb; font-size: 18px; font-weight: 700; }
    .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #9ca3af; }
    .mpesa-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 16px; margin-top: 24px; }
    .mpesa-title { font-size: 13px; font-weight: 600; color: #166534; margin-bottom: 8px; }
    .mpesa-step  { font-size: 12px; color: #166534; padding: 3px 0; }
    @media print {
      body { padding: 20px; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">
      <div class="logo-icon">FC</div>
      <div>
        <div class="logo-name">FiberCRM</div>
        <div class="logo-sub">Fiber Internet Services</div>
      </div>
    </div>
    <div class="invoice-meta">
      <div class="invoice-no">${d.invoiceNo}</div>
      <div class="status-badge">${d.status.toUpperCase()}</div>
    </div>
  </div>

  <hr class="divider">

  <div class="grid-2">
    <div>
      <div class="section-title">Bill to</div>
      <div class="detail-row"><span class="detail-value" style="font-size:15px">${d.customerName}</span></div>
      ${d.customerPhone  ? `<div class="detail-row"><span class="detail-label">Phone</span><span class="detail-value">${d.customerPhone}</span></div>` : ""}
      ${d.customerEmail  ? `<div class="detail-row"><span class="detail-label">Email</span><span class="detail-value">${d.customerEmail}</span></div>` : ""}
      ${d.customerAddress? `<div class="detail-row"><span class="detail-label">Address</span><span class="detail-value">${d.customerAddress}</span></div>` : ""}
    </div>
    <div>
      <div class="section-title">Invoice details</div>
      <div class="detail-row"><span class="detail-label">Invoice no.</span><span class="detail-value">${d.invoiceNo}</span></div>
      <div class="detail-row"><span class="detail-label">Issue date</span><span class="detail-value">${d.issueDate}</span></div>
      <div class="detail-row"><span class="detail-label">Due date</span><span class="detail-value">${d.dueDate}</span></div>
      ${d.billingPeriod ? `<div class="detail-row"><span class="detail-label">Period</span><span class="detail-value">${d.billingPeriod}</span></div>` : ""}
      ${d.paidAt        ? `<div class="detail-row"><span class="detail-label">Paid on</span><span class="detail-value" style="color:#166534">${d.paidAt}</span></div>` : ""}
    </div>
  </div>

  <hr class="divider">

  <div class="section-title">Services</div>
  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th>Details</th>
        <th style="text-align:right">Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>${d.planName}</strong><br><span style="color:#6b7280;font-size:12px">Fiber internet service</span></td>
        <td style="color:#6b7280">${d.speedDown}↓ / ${d.speedUp}↑ Mbps<br>Unlimited data</td>
        <td style="text-align:right;font-weight:600">${formatKES(d.amountKes)}</td>
      </tr>
    </tbody>
  </table>

  <div class="amount-box">
    <div class="amount-row"><span>Subtotal</span><span>${formatKES(d.amountKes)}</span></div>
    <div class="amount-row"><span>Tax</span><span>Included</span></div>
    ${totalPaid > 0 ? `<div class="amount-row" style="color:#166534"><span>Amount paid</span><span>−${formatKES(totalPaid)}</span></div>` : ""}
    <div class="amount-total">
      <span>${isPaid ? "Paid" : "Balance due"}</span>
      <span style="color:${isPaid ? "#166534" : "#111827"}">${formatKES(isPaid ? d.amountKes : balance)}</span>
    </div>
  </div>

  ${d.payments?.length ? `
  <hr class="divider">
  <div class="section-title">Payment history</div>
  <table>
    <thead><tr><th>Date</th><th>Method</th><th>Reference</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>${paymentRows}</tbody>
  </table>
  ` : ""}

  ${!isPaid ? `
  <div class="mpesa-box">
    <div class="mpesa-title">How to pay via M-Pesa</div>
    <div class="mpesa-step">1. Go to M-Pesa → Lipa na M-Pesa → Pay Bill</div>
    <div class="mpesa-step">2. Business number: <strong>${process.env.MPESA_SHORTCODE ?? "123456"}</strong></div>
    <div class="mpesa-step">3. Account number: <strong>${d.invoiceNo}</strong></div>
    <div class="mpesa-step">4. Amount: <strong>${formatKES(d.amountKes)}</strong></div>
    <div class="mpesa-step">5. Enter PIN and confirm</div>
  </div>` : ""}

  <div class="footer">
    <p>FiberCRM · Nairobi, Kenya · support@fibercrm.co.ke · 0800 000 000</p>
    <p style="margin-top:4px">Thank you for choosing FiberCRM for your internet needs.</p>
  </div>

  <script class="no-print">
    // Auto-print when opened in new tab
    window.onload = () => setTimeout(() => window.print(), 500);
  </script>
</body>
</html>`;
}
