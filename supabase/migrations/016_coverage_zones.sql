-- ─────────────────────────────────────────────────────────────────────────────
-- 016_coverage_zones.sql
-- Coverage zones define which areas the ISP serves.
-- Linked from addresses → coverage_zone_id.
-- Used for: lead qualification, installer dispatching, portal sign-up area picker.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.coverage_zones (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(80)  NOT NULL,
  county      VARCHAR(60)  NOT NULL DEFAULT 'Nairobi',
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  -- Bounding box for rough area check (lat/lng min/max)
  lat_min     DECIMAL(9,6),
  lat_max     DECIMAL(9,6),
  lng_min     DECIMAL(9,6),
  lng_max     DECIMAL(9,6),
  -- Network node serving this zone
  primary_node_id UUID     REFERENCES public.network_nodes(id) ON DELETE SET NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX coverage_zones_active_idx ON public.coverage_zones (is_active) WHERE is_active = TRUE;
CREATE INDEX coverage_zones_county_idx ON public.coverage_zones (county);

-- Add FK from addresses to coverage_zones
ALTER TABLE public.addresses
  ADD CONSTRAINT addresses_coverage_zone_fk
  FOREIGN KEY (coverage_zone_id)
  REFERENCES public.coverage_zones(id)
  ON DELETE SET NULL;

-- ── Seed: Nairobi coverage zones ──────────────────────────────────────────────
INSERT INTO public.coverage_zones (id, name, county, is_active, lat_min, lat_max, lng_min, lng_max)
VALUES
  ('z1000000-0000-0000-0000-000000000001', 'Westlands',   'Nairobi', TRUE, -1.280, -1.255, 36.795, 36.825),
  ('z1000000-0000-0000-0000-000000000002', 'Kilimani',    'Nairobi', TRUE, -1.305, -1.280, 36.775, 36.800),
  ('z1000000-0000-0000-0000-000000000003', 'Karen',       'Nairobi', TRUE, -1.360, -1.330, 36.695, 36.730),
  ('z1000000-0000-0000-0000-000000000004', 'Parklands',   'Nairobi', TRUE, -1.270, -1.250, 36.815, 36.835),
  ('z1000000-0000-0000-0000-000000000005', 'Kasarani',    'Nairobi', TRUE, -1.230, -1.200, 36.880, 36.910),
  ('z1000000-0000-0000-0000-000000000006', 'Ruaka',       'Kiambu',  TRUE, -1.225, -1.200, 36.780, 36.810),
  ('z1000000-0000-0000-0000-000000000007', 'Upper Hill',  'Nairobi', TRUE, -1.310, -1.295, 36.815, 36.835),
  ('z1000000-0000-0000-0000-000000000008', 'Lavington',   'Nairobi', TRUE, -1.295, -1.275, 36.775, 36.800),
  ('z1000000-0000-0000-0000-000000000009', 'Runda',       'Nairobi', TRUE, -1.230, -1.210, 36.820, 36.850),
  ('z1000000-0000-0000-0000-000000000010', 'Muthaiga',    'Nairobi', TRUE, -1.255, -1.235, 36.840, 36.865)
ON CONFLICT (id) DO NOTHING;

-- ── View: zone with coverage stats ────────────────────────────────────────────
CREATE OR REPLACE VIEW public.coverage_zone_stats AS
SELECT
  cz.id,
  cz.name,
  cz.county,
  cz.is_active,
  nn.name         AS node_name,
  nn.status       AS node_status,
  COUNT(DISTINCT a.id)  AS address_count,
  COUNT(DISTINCT c.id)  AS customer_count
FROM public.coverage_zones cz
LEFT JOIN public.network_nodes nn ON nn.id = cz.primary_node_id
LEFT JOIN public.addresses a      ON a.coverage_zone_id = cz.id
LEFT JOIN public.customers c      ON c.address_id = a.id AND c.status = 'active'
GROUP BY cz.id, cz.name, cz.county, cz.is_active, nn.name, nn.status
ORDER BY customer_count DESC;

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.coverage_zones ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read zones (needed for sign-up area picker)
CREATE POLICY "authenticated_read_zones"
  ON public.coverage_zones FOR SELECT
  USING (auth.role() = 'authenticated');

-- Admin only can manage zones
CREATE POLICY "admin_manage_zones"
  ON public.coverage_zones FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );
