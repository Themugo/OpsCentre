-- ─────────────────────────────────────────────────────────────────────────────
-- 014_seed_data.sql
-- Development seed data. DO NOT run in production.
-- Populates: coverage zones, service plans, network nodes, staff users,
--            customers, addresses, subscriptions, invoices, field jobs,
--            support tickets, and leads.
-- ─────────────────────────────────────────────────────────────────────────────

-- Guard: only run in non-production environments
DO $$
BEGIN
  IF current_setting('app.environment', true) = 'production' THEN
    RAISE EXCEPTION 'Seed data must not be run in production!';
  END IF;
END $$;

-- ── Service plans ─────────────────────────────────────────────────────────────
INSERT INTO public.service_plans
  (id, name, type, speed_down_mbps, speed_up_mbps, price_kes, billing_cycle, is_active)
VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Starter Home',    'home',     10,  5,   1800,  'monthly', TRUE),
  ('a1000000-0000-0000-0000-000000000002', 'Home Plus',       'home',     30,  15,  3500,  'monthly', TRUE),
  ('a1000000-0000-0000-0000-000000000003', 'Home Max',        'home',     50,  25,  5500,  'monthly', TRUE),
  ('a1000000-0000-0000-0000-000000000004', 'Business Basic',  'business', 50,  25,  8500,  'monthly', TRUE),
  ('a1000000-0000-0000-0000-000000000005', 'Business Pro',    'business', 100, 50,  12000, 'monthly', TRUE),
  ('a1000000-0000-0000-0000-000000000006', 'Business Ultra',  'business', 500, 250, 45000, 'monthly', TRUE),
  ('a1000000-0000-0000-0000-000000000007', 'Estate Standard', 'estate',   100, 50,  35000, 'monthly', TRUE),
  ('a1000000-0000-0000-0000-000000000008', 'Estate Premium',  'estate',   200, 100, 65000, 'monthly', TRUE)
ON CONFLICT (id) DO NOTHING;

-- ── Network nodes ─────────────────────────────────────────────────────────────
INSERT INTO public.network_nodes
  (id, name, type, location, ip_address, status, last_seen_at)
VALUES
  ('b1000000-0000-0000-0000-000000000001', 'Core Router — CBD',     'core',         'Nairobi CBD',    '10.0.0.1',  'online',   NOW()),
  ('b1000000-0000-0000-0000-000000000002', 'Node A — Westlands',    'distribution', 'Westlands',      '10.0.1.1',  'online',   NOW()),
  ('b1000000-0000-0000-0000-000000000003', 'Node B — Kilimani',     'distribution', 'Kilimani',       '10.0.2.1',  'online',   NOW()),
  ('b1000000-0000-0000-0000-000000000004', 'Node C — Kasarani',     'distribution', 'Kasarani',       '10.0.3.1',  'degraded', NOW() - INTERVAL '10 minutes'),
  ('b1000000-0000-0000-0000-000000000005', 'Node D — Thika Rd',     'access',       'Thika Road',     '10.0.4.1',  'down',     NOW() - INTERVAL '2 hours'),
  ('b1000000-0000-0000-0000-000000000006', 'Node E — Ruaka',        'access',       'Ruaka',          '10.0.5.1',  'online',   NOW()),
  ('b1000000-0000-0000-0000-000000000007', 'Node F — Karen',        'access',       'Karen',          '10.0.6.1',  'online',   NOW()),
  ('b1000000-0000-0000-0000-000000000008', 'Node G — Parklands',    'access',       'Parklands',      '10.0.7.1',  'online',   NOW())
ON CONFLICT (id) DO NOTHING;

-- Seed node metrics for online nodes
INSERT INTO public.node_metrics (node_id, throughput_mbps, latency_ms, packet_loss_pct, connected_clients, recorded_at)
SELECT
  id,
  ROUND((RANDOM() * 800 + 200)::NUMERIC, 1),
  ROUND((RANDOM() * 15 + 8)::NUMERIC, 1),
  ROUND((RANDOM() * 0.5)::NUMERIC, 2),
  FLOOR(RANDOM() * 200 + 50)::INT,
  NOW() - (s.i * INTERVAL '5 minutes')
FROM public.network_nodes, generate_series(1, 12) AS s(i)
WHERE status = 'online';

-- ── Addresses ─────────────────────────────────────────────────────────────────
INSERT INTO public.addresses (id, street, area, county, lat, lng)
VALUES
  ('c1000000-0000-0000-0000-000000000001', 'Apt 4B, Kilimani Rd',      'Kilimani',   'Nairobi', -1.2920, 36.7827),
  ('c1000000-0000-0000-0000-000000000002', '12th Fl, Delta House',      'Westlands',  'Nairobi', -1.2685, 36.8070),
  ('c1000000-0000-0000-0000-000000000003', 'Sunrise Apartments, Karen', 'Karen',      'Nairobi', -1.3441, 36.7128),
  ('c1000000-0000-0000-0000-000000000004', 'Plot 22, Ruaka Town',       'Ruaka',      'Kiambu',  -1.2100, 36.7920),
  ('c1000000-0000-0000-0000-000000000005', 'City Plaza Mall, UH',       'Upper Hill', 'Nairobi', -1.2989, 36.8219)
ON CONFLICT (id) DO NOTHING;

-- ── Customers ─────────────────────────────────────────────────────────────────
INSERT INTO public.customers (id, name, email, phone, type, status, address_id)
VALUES
  ('d1000000-0000-0000-0000-000000000001', 'John Kariuki',        'john.kariuki@email.com',    '0722456789', 'home',     'active',    'c1000000-0000-0000-0000-000000000001'),
  ('d1000000-0000-0000-0000-000000000002', 'Acme Towers Ltd',     'it@acmetowers.co.ke',       '0733100200', 'business', 'active',    'c1000000-0000-0000-0000-000000000002'),
  ('d1000000-0000-0000-0000-000000000003', 'Sunrise Apartments',  'manager@sunriseapts.co.ke', '0711222333', 'estate',   'active',    'c1000000-0000-0000-0000-000000000003'),
  ('d1000000-0000-0000-0000-000000000004', 'Peter Ngugi',         'peter.ngugi@gmail.com',     '0700123456', 'home',     'active',    'c1000000-0000-0000-0000-000000000004'),
  ('d1000000-0000-0000-0000-000000000005', 'City Plaza Mall',     'admin@cityplaza.co.ke',     '0720999888', 'business', 'active',    'c1000000-0000-0000-0000-000000000005')
ON CONFLICT (id) DO NOTHING;

-- ── Subscriptions ─────────────────────────────────────────────────────────────
INSERT INTO public.subscriptions
  (id, customer_id, plan_id, status, start_date, next_billing_date, static_ip)
VALUES
  ('e1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'active', '2023-03-14', CURRENT_DATE + 1, '197.248.10.1'),
  ('e1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000005', 'active', '2022-01-10', CURRENT_DATE + 5, '197.248.10.2'),
  ('e1000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000007', 'active', '2021-08-01', CURRENT_DATE + 3, '197.248.10.3'),
  ('e1000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001', 'active', '2023-06-20', CURRENT_DATE + 8, '197.248.10.4'),
  ('e1000000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000006', 'active', '2023-09-01', CURRENT_DATE + 2, '197.248.10.5')
ON CONFLICT (id) DO NOTHING;

-- ── Invoices ──────────────────────────────────────────────────────────────────
INSERT INTO public.invoices
  (id, invoice_no, subscription_id, amount_kes, status, due_date, billing_period_start, billing_period_end, paid_at)
VALUES
  ('f1000000-0000-0000-0000-000000000001', 'INV-2026-00891', 'e1000000-0000-0000-0000-000000000001', 3500,  'pending', CURRENT_DATE + 1, DATE_TRUNC('month', NOW()), DATE_TRUNC('month', NOW()) + INTERVAL '1 month - 1 day', NULL),
  ('f1000000-0000-0000-0000-000000000002', 'INV-2026-00892', 'e1000000-0000-0000-0000-000000000002', 12000, 'overdue', CURRENT_DATE - 5, DATE_TRUNC('month', NOW()) - INTERVAL '1 month', DATE_TRUNC('month', NOW()) - INTERVAL '1 day', NULL),
  ('f1000000-0000-0000-0000-000000000003', 'INV-2026-00890', 'e1000000-0000-0000-0000-000000000003', 35000, 'overdue', CURRENT_DATE - 15, DATE_TRUNC('month', NOW()) - INTERVAL '1 month', DATE_TRUNC('month', NOW()) - INTERVAL '1 day', NULL),
  ('f1000000-0000-0000-0000-000000000004', 'INV-2026-00889', 'e1000000-0000-0000-0000-000000000004', 1800,  'paid',    CURRENT_DATE - 10, DATE_TRUNC('month', NOW()) - INTERVAL '1 month', DATE_TRUNC('month', NOW()) - INTERVAL '1 day', NOW() - INTERVAL '8 days'),
  ('f1000000-0000-0000-0000-000000000005', 'INV-2026-00888', 'e1000000-0000-0000-0000-000000000005', 45000, 'draft',   CURRENT_DATE + 3, DATE_TRUNC('month', NOW()), DATE_TRUNC('month', NOW()) + INTERVAL '1 month - 1 day', NULL)
ON CONFLICT (id) DO NOTHING;

-- ── Payments ──────────────────────────────────────────────────────────────────
INSERT INTO public.payments (invoice_id, amount_kes, method, mpesa_ref, paid_at)
VALUES
  ('f1000000-0000-0000-0000-000000000004', 1800, 'mpesa', 'QWE1234ABC', NOW() - INTERVAL '8 days')
ON CONFLICT DO NOTHING;

-- ── Field jobs ────────────────────────────────────────────────────────────────
INSERT INTO public.field_jobs
  (id, type, customer_id, address_id, status, priority, scheduled_at, notes)
VALUES
  ('g1000000-0000-0000-0000-000000000001', 'installation', 'd1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'in_progress', 'medium', NOW() - INTERVAL '1 hour', 'Home Plus install. Customer requested cable behind skirting.'),
  ('g1000000-0000-0000-0000-000000000002', 'repair',       'd1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000002', 'scheduled',   'critical', NOW() + INTERVAL '2 hours', 'No internet since yesterday. SLA breached.'),
  ('g1000000-0000-0000-0000-000000000003', 'survey',       'd1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000003', 'scheduled',   'medium',  NOW() + INTERVAL '5 hours', 'New estate survey — 80 units.'),
  ('g1000000-0000-0000-0000-000000000004', 'installation', 'd1000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000004', 'done',        'medium',  NOW() - INTERVAL '3 hours', NULL),
  ('g1000000-0000-0000-0000-000000000005', 'upgrade',      'd1000000-0000-0000-0000-000000000005', 'c1000000-0000-0000-0000-000000000005', 'done',        'medium',  NOW() - INTERVAL '2 hours', 'Upgraded from Business Basic to Business Ultra.')
ON CONFLICT (id) DO NOTHING;

-- ── Support tickets ───────────────────────────────────────────────────────────
INSERT INTO public.support_tickets
  (id, ticket_no, customer_id, category, priority, status, subject, description)
VALUES
  ('h1000000-0000-0000-0000-000000000001', 'TKT-00041', 'd1000000-0000-0000-0000-000000000001', 'technical', 'medium',   'in_progress', 'Speed slower than plan',           'Getting only 18Mbps but plan promises 30Mbps.'),
  ('h1000000-0000-0000-0000-000000000002', 'TKT-00040', 'd1000000-0000-0000-0000-000000000002', 'technical', 'critical', 'open',        'No internet since yesterday',      'Entire office is down. Business impacted.'),
  ('h1000000-0000-0000-0000-000000000003', 'TKT-00039', 'd1000000-0000-0000-0000-000000000003', 'billing',   'high',     'open',        'Invoice dispute — overcharged',    'March invoice shows KES 45,000 but contract says 35,000.'),
  ('h1000000-0000-0000-0000-000000000004', 'TKT-00028', 'd1000000-0000-0000-0000-000000000001', 'billing',   'low',      'resolved',    'Invoice dispute — Mar 2026',        'Resolved — credit applied.'),
  ('h1000000-0000-0000-0000-000000000005', 'TKT-00015', 'd1000000-0000-0000-0000-000000000004', 'general',   'low',      'closed',      'Router config help needed',        'Helped customer set up guest WiFi.')
ON CONFLICT (id) DO NOTHING;

-- ── Leads ─────────────────────────────────────────────────────────────────────
INSERT INTO public.leads
  (id, name, phone, email, source, stage, monthly_value_kes, area)
VALUES
  ('i1000000-0000-0000-0000-000000000001', 'James Kariuki',       '0712345111', 'james.k@email.com',    'referral',  'qualified', 3500,  'Westlands'),
  ('i1000000-0000-0000-0000-000000000002', 'Acme Towers (new)',   '0733100201', NULL,                   'web',       'proposal',  12000, 'CBD'),
  ('i1000000-0000-0000-0000-000000000003', 'Mary Wanjiku',        '0712345222', NULL,                   'field',     'new',       1800,  'Kilimani'),
  ('i1000000-0000-0000-0000-000000000004', 'Green Park Estate',   '0711222444', 'gm@greenpark.co.ke',  'agent',     'proposal',  55000, 'Karen'),
  ('i1000000-0000-0000-0000-000000000005', 'TechHub Nairobi',     '0722888777', 'admin@techhub.co.ke', 'referral',  'won',       18000, 'Westlands'),
  ('i1000000-0000-0000-0000-000000000006', 'Brian Odhiambo',      '0700999111', NULL,                   'field',     'new',       3500,  'Ruaka'),
  ('i1000000-0000-0000-0000-000000000007', 'Midtown Suites',      '0733444555', NULL,                   'web',       'lost',      22000, 'Upper Hill')
ON CONFLICT (id) DO NOTHING;
