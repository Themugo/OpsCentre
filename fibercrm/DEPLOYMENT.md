# FiberCRM — Production Go-Live Checklist

## Phase 1 — Database ✅
- [ ] Run all 14 SQL migrations in order (001 → 013)
- [ ] Seed data loaded in staging (skip 014 in prod)
- [ ] All RLS policies verified with `supabase db lint`
- [ ] Supabase Auth email templates customised
- [ ] First admin user created via Supabase dashboard → Auth → Users

## Phase 2 — Backend ✅
- [ ] All env variables set in Vercel (Settings → Environment Variables)
- [ ] M-Pesa Daraja: switch MPESA_ENV=production
- [ ] M-Pesa: register C2B URLs via `/api/mpesa/register-urls` (one-time)
- [ ] M-Pesa: set MPESA_ENFORCE_IP_ALLOWLIST=true
- [ ] Stripe: switch to live keys (sk_live_*, pk_live_*)
- [ ] Stripe: configure webhook → https://yourdomain.com/api/stripe/webhook
- [ ] Stripe: enable events: payment_intent.succeeded, payment_intent.payment_failed
- [ ] Africa's Talking: switch from sandbox username to production
- [ ] Resend: verify sending domain (DNS records)
- [ ] CRON_SECRET set to a strong random value (openssl rand -hex 32)

## Phase 3 — Edge Functions ✅
- [ ] Deploy: `supabase functions deploy auto-invoice`
- [ ] Deploy: `supabase functions deploy reconcile-mpesa`
- [ ] Deploy: `supabase functions deploy network-poller`
- [ ] Set Edge Function secrets in Supabase dashboard
- [ ] Test auto-invoice manually: POST to functions/v1/auto-invoice
- [ ] Verify cron schedule in Vercel dashboard (Settings → Cron Jobs)

## Phase 4 — Customer Portal ✅
- [ ] Portal domain configured (portal.yourdomain.com or /portal path)
- [ ] Customer auth flow tested end-to-end
- [ ] M-Pesa STK Push tested in staging with real phone
- [ ] Invoice PDF opens and prints correctly
- [ ] Ticket creation tested

## Phase 5 — Field App ✅
- [ ] PWA tested on Android (Chrome) and iOS (Safari)
- [ ] Add to Home Screen tested
- [ ] Field app tested on real devices with poor connectivity
- [ ] Job completion flow tested end-to-end

## Phase 6 — Hardening ✅
- [ ] Sentry DSN configured and error tracking working
- [ ] All console.log replaced with proper logging in production
- [ ] Rate limiting on /api/mpesa/pay (max 3 req/min per user)
- [ ] CORS headers verified — only allow your domains
- [ ] Security headers verified (run securityheaders.com scan)
- [ ] SSL certificate active
- [ ] Supabase backups enabled (daily)
- [ ] Database connection pooling enabled (Supabase → Settings → Database)

## Smoke Tests — Run after deploy
```bash
# 1. Health check
curl https://yourdomain.com/api/health

# 2. Login works
# Open https://yourdomain.com/login → sign in as admin

# 3. Dashboard loads with real data
# Check KPI cards show real customer/invoice counts

# 4. M-Pesa STK Push (sandbox)
# Go to Invoices → click Pay → enter 254708374149 (Safaricom test number)

# 5. Edge Function cron
curl -X POST https://xxxx.supabase.co/functions/v1/auto-invoice \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"

# 6. Network poller
curl -X POST https://xxxx.supabase.co/functions/v1/network-poller \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

## Support contacts
- Safaricom Daraja: apisupport@safaricom.co.ke
- Africa's Talking: support@africastalking.com
- Supabase: support@supabase.io
- Stripe: support@stripe.com
