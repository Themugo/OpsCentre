// ─── POST /api/mpesa/status ───────────────────────────────────────────────────
// Polls the DB for the latest status of a pending M-Pesa transaction.
// Called by the billing UI every 3 seconds after initiating STK push.

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const { checkoutRequestId } = await req.json();

  if (!checkoutRequestId) {
    return NextResponse.json({ error: "checkoutRequestId required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: txn } = await supabase
    .from("mpesa_transactions")
    .select("status, mpesa_receipt, result_desc")
    .eq("checkout_request_id", checkoutRequestId)
    .single();

  if (!txn) {
    return NextResponse.json({ status: "pending" });
  }

  return NextResponse.json({
    status:  txn.status,
    receipt: txn.mpesa_receipt,
    message: txn.result_desc,
  });
}
