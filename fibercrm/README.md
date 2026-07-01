# FiberCRM — ISP ERP + CRM + Billing Platform

Full-stack SaaS for fiber internet providers. Built with **Next.js 15**, **Supabase**, **TypeScript**, and **M-Pesa Daraja API**.

---

## Stack

| Layer        | Technology                          |
|--------------|-------------------------------------|
| Frontend     | Next.js 15 (App Router), React 18   |
| Styling      | Tailwind CSS                        |
| Database     | Supabase (PostgreSQL + Auth + RLS)  |
| Payments     | M-Pesa Daraja STK Push              |
| Data layer   | React Query (TanStack)              |
| Validation   | Zod + React Hook Form               |
| Notifications| Africa's Talking SMS, Resend email  |

---

## Project structure

```
src/
├── app/
│   ├── login/              # Auth pages
│   ├── dashboard/          # Staff ERP (admin, billing, sales, support)
│   │   ├── page.tsx        # Dashboard home — KPIs
│   │   ├── customers/      # Customer accounts
│   │   ├── invoices/       # Billing + M-Pesa payments
│   │   ├── leads/          # CRM pipeline
│   │   ├── tickets/        # Support tickets
│   │   ├── field-jobs/     # Field technician dispatch
│   │   ├── network/        # Node monitoring
│   │   ├── plans/          # Service plan management
│   │   └── reports/        # Finance & analytics
│   ├── portal/             # Customer self-service portal
│   ├── field/              # Technician mobile PWA
│   └── api/
│       ├── mpesa/          # STK push, callbacks, status polling
│       ├── customers/      # Customer CRUD
│       ├── invoices/       # Invoice generation
│       └── field-jobs/     # Job assignment + status
├── components/
│   ├── ui/                 # Shared: Sidebar, Topbar, Table, Modal, Badge…
│   ├── billing/            # Invoice cards, M-Pesa modal
│   ├── crm/                # Lead pipeline, ticket forms
│   └── field/              # Job cards, checklist, signature pad
├── lib/
│   ├── supabase.ts         # Browser / server / service clients
│   └── utils.ts            # formatKES, formatDate, cn, initials…
├── hooks/                  # useMpesaPayment, useCurrentUser…
├── types/
│   └── supabase.ts         # Auto-generated DB types
└── middleware.ts            # Auth guard + role-based routing
supabase/
├── migrations/             # All SQL migrations
└── seed/                   # Seed data for dev
```

---

## Quick start

### 1. Clone and install

```bash
git clone https://github.com/yourorg/fibercrm.git
cd fibercrm
npm install
```

### 2. Set up environment

```bash
cp .env.example .env.local
# Fill in your Supabase URL, anon key, service role key
# Fill in M-Pesa Daraja credentials
```

### 3. Set up Supabase

```bash
# Install Supabase CLI
npm install -g supabase

# Start local Supabase
supabase start

# Run migrations
npm run db:migrate

# Seed dev data
npm run db:seed

# Generate TypeScript types
npm run db:types
```

### 4. Run in development

```bash
npm run dev
# App: http://localhost:3000
# Supabase Studio: http://localhost:54323
```

### 5. M-Pesa development (sandbox)

```bash
# Expose local server for Safaricom callbacks
npx ngrok http 3000

# Update NEXT_PUBLIC_APP_URL in .env.local with ngrok URL
# Register C2B URLs (one-time):
curl -X POST http://localhost:3000/api/mpesa/register-urls
```

---

## User roles

| Role     | Access                                    |
|----------|-------------------------------------------|
| admin    | Full access — all modules                 |
| billing  | Invoices, payments, customers, reports    |
| sales    | Leads, CRM pipeline, customers            |
| support  | Tickets, customers, field jobs            |
| tech     | Field app only (/field)                   |
| customer | Self-service portal only (/portal)        |

---

## Deployment

### Frontend (Vercel)
```bash
vercel deploy
# Set env vars in Vercel dashboard
```

### Database (Supabase Cloud)
```bash
supabase link --project-ref your-project-ref
supabase db push
```

### M-Pesa production
1. Register on [Safaricom Developer Portal](https://developer.safaricom.co.ke)
2. Go live with your Paybill/Till shortcode
3. Set `MPESA_ENV=production` in environment
4. Set `MPESA_ENFORCE_IP_ALLOWLIST=true`

---

## Modules built

- [x] ERP Dashboard — KPIs, revenue, network, jobs overview
- [x] CRM — Leads pipeline, contacts, support tickets
- [x] Billing — Invoices, M-Pesa STK Push, C2B Paybill
- [x] Field Technician — Job dispatch, checklists, mobile PWA
- [x] Customer Portal — Self-service, invoices, speed stats, tickets
- [x] Network Monitor — Node status, metrics, alerts
- [x] Finance Reports — Revenue, churn, ARPU, collection rate
- [x] Auth — Role-based access, Supabase Auth, RLS policies

---

## License

MIT — built for fiber ISPs across East Africa 🇰🇪
