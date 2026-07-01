// ─── GET /api/mpesa/register-urls ────────────────────────────────────────────
// One-time setup: registers C2B Confirmation + Validation URLs with Safaricom.
// Run once after deploying to production or when callback URLs change.
// Protected by CRON_SECRET so only admins can trigger it.

import { NextRequest, NextResponse } from "next/server";

const DARAJA_BASE = process.env.MPESA_ENV === "production"
  ? "https://api.safaricom.co.ke"
  : "https://sandbox.safaricom.co.ke";

async function getDarajaToken(): Promise<string> {
  const creds = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  ).toString("base64");

  const res = await fetch(
    `${DARAJA_BASE}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${creds}` } }
  );
  const data = await res.json();
  if (!data.access_token) throw new Error("Daraja auth failed");
  return data.access_token;
}

export async function GET(req: NextRequest) {
  // Auth: admin only via cron secret or Authorization header
  const secret = req.headers.get("x-admin-secret") ??
    req.nextUrl.searchParams.get("secret");

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;

  try {
    const token = await getDarajaToken();

    const res = await fetch(`${DARAJA_BASE}/mpesa/c2b/v1/registerurl`, {
      method: "POST",
      headers: {
        Authorization:  `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ShortCode:       process.env.MPESA_SHORTCODE,
        ResponseType:    "Completed",
        ConfirmationURL: `${appUrl}/api/mpesa/callback/c2b/confirm`,
        ValidationURL:   `${appUrl}/api/mpesa/callback/c2b/validate`,
      }),
    });

    const data = await res.json();
    console.log("[register-urls] Daraja response:", data);

    return NextResponse.json({
      ok:               true,
      confirmationUrl:  `${appUrl}/api/mpesa/callback/c2b/confirm`,
      validationUrl:    `${appUrl}/api/mpesa/callback/c2b/validate`,
      darajaResponse:   data,
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
