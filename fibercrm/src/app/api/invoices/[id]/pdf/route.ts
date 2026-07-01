// ─── GET /api/invoices/[id]/pdf ───────────────────────────────────────────────
// Returns a print-ready HTML page for the invoice.
// Opens in new tab → browser prints / saves as PDF.

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { getInvoicePDFData, generateInvoiceHTML } from "@/lib/services/pdf-invoice.service";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const data = await getInvoicePDFData(params.id);
  if (!data) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const html = generateInvoiceHTML(data);

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
