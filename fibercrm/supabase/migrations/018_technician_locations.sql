-- ─────────────────────────────────────────────────────────────────────────────
-- 018_technician_locations.sql
-- Real-time GPS location of field technicians.
-- Updated by the field mobile app every 2 minutes while on duty.
-- Used by the network map and dispatch dashboard.
-- Depends on: 002_users
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.technician_locations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE UNIQUE,
  name        VARCHAR(120),         -- denormalized for fast map queries
  lat         DECIMAL(9,6) NOT NULL,
  lng         DECIMAL(9,6) NOT NULL,
  accuracy_m  DECIMAL(8,2),         -- GPS accuracy in meters
  heading     DECIMAL(5,2),         -- 0-360 degrees
  speed_kmh   DECIMAL(6,2),         -- current speed
  status      VARCHAR(20) NOT NULL DEFAULT 'on_duty',
                                    -- on_duty | en_route | at_site | off_duty
  current_job_id UUID REFERENCES public.field_jobs(id) ON DELETE SET NULL,
  battery_pct INTEGER,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast map query — only need latest location per technician
CREATE UNIQUE INDEX tech_location_user_idx ON public.technician_locations (user_id);
CREATE INDEX tech_location_updated_idx    ON public.technician_locations (updated_at DESC);
CREATE INDEX tech_location_status_idx     ON public.technician_locations (status)
  WHERE status != 'off_duty';

-- Location history (separate table — don't bloat the live table)
CREATE TABLE public.technician_location_history (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  lat        DECIMAL(9,6) NOT NULL,
  lng        DECIMAL(9,6) NOT NULL,
  status     VARCHAR(20),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX tech_loc_history_user_idx ON public.technician_location_history (user_id, recorded_at DESC);

-- Purge history older than 30 days
CREATE OR REPLACE FUNCTION public.purge_old_location_history()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE deleted INTEGER;
BEGIN
  DELETE FROM public.technician_location_history
  WHERE recorded_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.technician_locations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technician_location_history  ENABLE ROW LEVEL SECURITY;

-- Staff can read all technician locations (for dispatch map)
CREATE POLICY "staff_read_tech_locations"
  ON public.technician_locations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'support', 'billing')
    )
  );

-- Technicians can read all (to see colleagues on map)
CREATE POLICY "tech_read_locations"
  ON public.technician_locations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'tech'
    )
  );

-- Technicians can only update their own location
CREATE POLICY "tech_update_own_location"
  ON public.technician_locations FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Service role can write all
CREATE POLICY "service_role_write_locations"
  ON public.technician_locations FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "service_role_write_history"
  ON public.technician_location_history FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "staff_read_history"
  ON public.technician_location_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'support')
    )
  );
