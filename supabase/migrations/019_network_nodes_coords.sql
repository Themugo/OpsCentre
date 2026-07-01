-- ─────────────────────────────────────────────────────────────────────────────
-- 019_network_nodes_coords.sql
-- Adds lat/lng coordinates to network_nodes for the coverage map.
-- Also adds lat/lng to addresses view for customer map plotting.
-- Depends on: 009_network
-- ─────────────────────────────────────────────────────────────────────────────

-- Add coordinates to network_nodes
ALTER TABLE public.network_nodes
  ADD COLUMN IF NOT EXISTS lat DECIMAL(9,6),
  ADD COLUMN IF NOT EXISTS lng DECIMAL(9,6);

-- Seed coordinates for existing nodes
UPDATE public.network_nodes SET lat = -1.2864, lng = 36.8200 WHERE name ILIKE '%CBD%';
UPDATE public.network_nodes SET lat = -1.2686, lng = 36.8070 WHERE name ILIKE '%Westlands%';
UPDATE public.network_nodes SET lat = -1.2920, lng = 36.7827 WHERE name ILIKE '%Kilimani%';
UPDATE public.network_nodes SET lat = -1.2210, lng = 36.8957 WHERE name ILIKE '%Kasarani%';
UPDATE public.network_nodes SET lat = -1.2190, lng = 36.8890 WHERE name ILIKE '%Thika%';
UPDATE public.network_nodes SET lat = -1.2100, lng = 36.7920 WHERE name ILIKE '%Ruaka%';
UPDATE public.network_nodes SET lat = -1.3441, lng = 36.7128 WHERE name ILIKE '%Karen%';
UPDATE public.network_nodes SET lat = -1.2650, lng = 36.8250 WHERE name ILIKE '%Parklands%';

-- Update the network API response view to include coordinates
CREATE OR REPLACE VIEW public.network_nodes_with_coords AS
SELECT
  n.*,
  m.throughput_mbps,
  m.latency_ms,
  m.packet_loss_pct,
  m.connected_clients,
  m.recorded_at AS metric_recorded_at
FROM public.network_nodes n
LEFT JOIN LATERAL (
  SELECT throughput_mbps, latency_ms, packet_loss_pct, connected_clients, recorded_at
  FROM public.node_metrics
  WHERE node_id = n.id
  ORDER BY recorded_at DESC
  LIMIT 1
) m ON TRUE;

-- ── Update network API route to include lat/lng ───────────────────────────────
-- The /api/network route now returns lat and lng fields automatically
-- since we added columns to the base table.

-- ── Add index for geo queries ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS network_nodes_coords_idx
  ON public.network_nodes (lat, lng)
  WHERE lat IS NOT NULL AND lng IS NOT NULL;
