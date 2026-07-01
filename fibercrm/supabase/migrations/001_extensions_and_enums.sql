-- ─────────────────────────────────────────────────────────────────────────────
-- 001_extensions_and_enums.sql
-- Enable required extensions and define all shared enum types.
-- Run first — everything else depends on these types.
-- ─────────────────────────────────────────────────────────────────────────────

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- fast ILIKE search on names/emails

-- ── User roles ────────────────────────────────────────────────────────────────
CREATE TYPE user_role AS ENUM (
  'admin',
  'billing',
  'sales',
  'support',
  'tech',
  'customer'
);

-- ── Customer types & status ───────────────────────────────────────────────────
CREATE TYPE customer_type   AS ENUM ('home', 'business', 'estate');
CREATE TYPE customer_status AS ENUM ('active', 'suspended', 'churned');

-- ── Plan types & billing cycle ────────────────────────────────────────────────
CREATE TYPE plan_type      AS ENUM ('home', 'business', 'estate');
CREATE TYPE billing_cycle  AS ENUM ('monthly', 'quarterly', 'annual');

-- ── Subscription status ───────────────────────────────────────────────────────
CREATE TYPE subscription_status AS ENUM ('active', 'suspended', 'cancelled');

-- ── Invoice & payment status ──────────────────────────────────────────────────
CREATE TYPE invoice_status AS ENUM ('draft', 'sent', 'pending', 'paid', 'overdue');
CREATE TYPE payment_method AS ENUM ('mpesa', 'stripe', 'cash', 'bank');

-- ── M-Pesa transaction status ─────────────────────────────────────────────────
CREATE TYPE mpesa_status AS ENUM ('pending', 'success', 'failed', 'timeout');

-- ── Field job types & status ──────────────────────────────────────────────────
CREATE TYPE job_type   AS ENUM ('installation', 'repair', 'survey', 'upgrade');
CREATE TYPE job_status AS ENUM ('scheduled', 'en_route', 'in_progress', 'done', 'cancelled');

-- ── Network node types & status ───────────────────────────────────────────────
CREATE TYPE node_type   AS ENUM ('core', 'distribution', 'access');
CREATE TYPE node_status AS ENUM ('online', 'degraded', 'down');

-- ── Support ticket ────────────────────────────────────────────────────────────
CREATE TYPE ticket_category AS ENUM ('billing', 'technical', 'general');
CREATE TYPE ticket_priority AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE ticket_status   AS ENUM ('open', 'in_progress', 'resolved', 'closed');

-- ── Lead pipeline ─────────────────────────────────────────────────────────────
CREATE TYPE lead_source AS ENUM ('web', 'referral', 'field', 'agent', 'walk_in');
CREATE TYPE lead_stage  AS ENUM ('new', 'qualified', 'proposal', 'won', 'lost');
