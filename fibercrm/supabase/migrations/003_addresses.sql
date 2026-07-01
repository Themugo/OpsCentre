-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 003: Coverage zones & addresses
-- Zones define serviceable areas. Addresses reference a zone.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE coverage_zones (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(80)   NOT NULL,
  county      VARCHAR(60)   NOT NULL DEFAULT 'Nairobi',
  is_active   BOOLEAN       NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_zones_active ON coverage_zones (is_active) WHERE is_active = true;

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE coverage_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "zones_read_authenticated" ON coverage_zones
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "zones_admin_write" ON coverage_zones
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

CREATE POLICY "zones_service_role" ON coverage_zones
  FOR ALL USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE addresses (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  street            TEXT          NOT NULL,
  area              VARCHAR(80)   NOT NULL,
  county            VARCHAR(60)   NOT NULL DEFAULT 'Nairobi',
  lat               DECIMAL(9,6),
  lng               DECIMAL(9,6),
  coverage_zone_id  UUID REFERENCES coverage_zones(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_addresses_zone   ON addresses (coverage_zone_id);
CREATE INDEX idx_addresses_area   ON addresses (area);
CREATE INDEX idx_addresses_coords ON addresses (lat, lng)
  WHERE lat IS NOT NULL AND lng IS NOT NULL;

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "addresses_read_authenticated" ON addresses
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "addresses_staff_write" ON addresses
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'billing', 'sales', 'support', 'tech')
    )
  );

CREATE POLICY "addresses_service_role" ON addresses
  FOR ALL USING (auth.role() = 'service_role');
