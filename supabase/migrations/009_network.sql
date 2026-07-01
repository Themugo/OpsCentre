-- ─────────────────────────────────────────────────────────────────────────────
-- 009_network.sql
-- Network infrastructure: nodes (routers, switches, access points)
-- and time-series metrics polled from each node.
-- Depends on: 003_addresses
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Network nodes ─────────────────────────────────────────────────────────────
CREATE TABLE public.network_nodes (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(80)   NOT NULL,
  type            node_type     NOT NULL,
  location        VARCHAR(80)   NOT NULL,     -- Human label e.g. "Westlands CBD"
  address_id      UUID          REFERENCES public.addresses(id) ON DELETE SET NULL,
  ip_address      INET          NOT NULL UNIQUE,
  mac_address     MACADDR,
  status          node_status   NOT NULL DEFAULT 'online',
  parent_node_id  UUID          REFERENCES public.network_nodes(id) ON DELETE SET NULL,
  snmp_community  VARCHAR(50)   DEFAULT 'public',
  notes           TEXT,
  last_seen_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TRIGGER network_nodes_updated_at
  BEFORE UPDATE ON public.network_nodes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Indexes
CREATE INDEX network_nodes_status_idx   ON public.network_nodes (status);
CREATE INDEX network_nodes_type_idx     ON public.network_nodes (type);
CREATE INDEX network_nodes_ip_idx       ON public.network_nodes (ip_address);

-- ── Node metrics (time-series) ────────────────────────────────────────────────
CREATE TABLE public.node_metrics (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id             UUID          NOT NULL REFERENCES public.network_nodes(id) ON DELETE CASCADE,
  throughput_mbps     DECIMAL(10,2) NOT NULL DEFAULT 0,
  latency_ms          DECIMAL(8,2)  NOT NULL DEFAULT 0,
  packet_loss_pct     DECIMAL(5,2)  NOT NULL DEFAULT 0 CHECK (packet_loss_pct BETWEEN 0 AND 100),
  cpu_pct             DECIMAL(5,2)  CHECK (cpu_pct BETWEEN 0 AND 100),
  memory_pct          DECIMAL(5,2)  CHECK (memory_pct BETWEEN 0 AND 100),
  connected_clients   INTEGER       DEFAULT 0,
  recorded_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Indexes — heavy read on time range + node_id
CREATE INDEX node_metrics_node_time_idx
  ON public.node_metrics (node_id, recorded_at DESC);

CREATE INDEX node_metrics_recorded_idx
  ON public.node_metrics (recorded_at DESC);

-- Partition old metrics (keep 90 days hot, archive older rows)
CREATE OR REPLACE FUNCTION public.purge_old_node_metrics()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE deleted_count INTEGER;
BEGIN
  DELETE FROM public.node_metrics
  WHERE recorded_at < NOW() - INTERVAL '90 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- ── Status change alerting trigger ────────────────────────────────────────────
-- When a node goes from online → degraded or down, update last_seen_at
-- and raise a pg_notify event that the polling service listens to.
CREATE OR REPLACE FUNCTION public.notify_node_status_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status != OLD.status THEN
    PERFORM pg_notify(
      'node_status_changed',
      json_build_object(
        'node_id',     NEW.id,
        'name',        NEW.name,
        'old_status',  OLD.status,
        'new_status',  NEW.status,
        'location',    NEW.location
      )::text
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER network_node_status_notify
  AFTER UPDATE OF status ON public.network_nodes
  FOR EACH ROW EXECUTE FUNCTION public.notify_node_status_change();

-- ── Summary view ──────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.network_health_summary AS
SELECT
  COUNT(*)                                                   AS total_nodes,
  COUNT(*) FILTER (WHERE status = 'online')                  AS online_count,
  COUNT(*) FILTER (WHERE status = 'degraded')                AS degraded_count,
  COUNT(*) FILTER (WHERE status = 'down')                    AS down_count,
  ROUND(
    (COUNT(*) FILTER (WHERE status = 'online')::NUMERIC /
     NULLIF(COUNT(*), 0)) * 100, 1
  )                                                          AS uptime_pct
FROM public.network_nodes;

-- Latest metrics per node view
CREATE OR REPLACE VIEW public.latest_node_metrics AS
SELECT DISTINCT ON (nm.node_id)
  nm.*,
  nn.name     AS node_name,
  nn.location AS node_location,
  nn.status   AS node_status
FROM public.node_metrics nm
JOIN public.network_nodes nn ON nn.id = nm.node_id
ORDER BY nm.node_id, nm.recorded_at DESC;

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.network_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.node_metrics  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_read_nodes"
  ON public.network_nodes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'support', 'tech')
    )
  );

CREATE POLICY "admin_manage_nodes"
  ON public.network_nodes FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

CREATE POLICY "staff_read_metrics"
  ON public.node_metrics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'support', 'tech')
    )
  );

CREATE POLICY "service_role_write_metrics"
  ON public.node_metrics FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
