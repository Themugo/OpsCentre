"use client";
// ─── Network Coverage Map
// Requires: npm install leaflet @types/leaflet ─────────────────────────────────────────────────────
// Interactive Leaflet map showing coverage zones, network nodes,
// customers, and field technician locations.

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createBrowserClient } from "@/lib/supabase";
import { Badge, PageSpinner } from "@/components/ui";
import { Wifi, WifiOff, AlertTriangle, Users, MapPin, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type LayerToggle = "zones" | "nodes" | "customers" | "technicians";

export default function NetworkMapPage() {
  const mapRef      = useRef<HTMLDivElement>(null);
  const leafletRef  = useRef<any>(null);
  const markersRef  = useRef<any[]>([]);
  const zonesRef    = useRef<any[]>([]);

  const [activeLayer, setActiveLayer] = useState<Set<LayerToggle>>(
    new Set(["zones", "nodes"])
  );
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [mapReady, setMapReady]         = useState(false);

  const supabase = createBrowserClient();

  // ── Fetch data ─────────────────────────────────────────────────────────────
  const { data: nodes, isLoading: nodesLoading, refetch: refetchNodes } = useQuery({
    queryKey: ["map-nodes"],
    queryFn: async () => {
      const res = await fetch("/api/network?metrics=false");
      if (!res.ok) return [];
      const d = await res.json();
      return d.data ?? [];
    },
    refetchInterval: 30_000,
  });

  const { data: zones } = useQuery({
    queryKey: ["map-zones"],
    queryFn: async () => {
      const { data } = await supabase
        .from("coverage_zones")
        .select("id, name, county, is_active, lat_min, lat_max, lng_min, lng_max")
        .eq("is_active", true);
      return data ?? [];
    },
  });

  const { data: customerCounts } = useQuery({
    queryKey: ["map-customers"],
    queryFn: async () => {
      const { data } = await supabase
        .from("coverage_zone_stats")
        .select("id, name, customer_count, node_status");
      return data ?? [];
    },
  });

  const { data: techLocations } = useQuery({
    queryKey: ["map-technicians"],
    queryFn: async () => {
      const res = await fetch("/api/tracking");
      if (!res.ok) return [];
      const d = await res.json();
      return d.data ?? [];
    },
    refetchInterval: 30_000,
  });

  // ── Init Leaflet map ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || leafletRef.current) return;

    // Dynamically import Leaflet (client-only)
    import("leaflet").then(L => {
      // Fix default marker icons
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
        iconUrl:       "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
        shadowUrl:     "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      });

      const map = L.map(mapRef.current!, {
        center:    [-1.2921, 36.8219],  // Nairobi CBD
        zoom:      12,
        zoomControl: true,
      });

      // Tile layer — OpenStreetMap
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      leafletRef.current = { map, L };
      setMapReady(true);
    });

    return () => {
      if (leafletRef.current?.map) {
        leafletRef.current.map.remove();
        leafletRef.current = null;
      }
    };
  }, []);

  // ── Draw coverage zones ────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !zones) return;
    const { map, L } = leafletRef.current;

    // Clear old zones
    zonesRef.current.forEach(z => z.remove());
    zonesRef.current = [];

    if (!activeLayer.has("zones")) return;

    zones.forEach((zone: any) => {
      if (!zone.lat_min || !zone.lat_max || !zone.lng_min || !zone.lng_max) return;

      const bounds: [[number,number],[number,number]] = [
        [zone.lat_min, zone.lng_min],
        [zone.lat_max, zone.lng_max],
      ];

      const rect = L.rectangle(bounds, {
        color:       "#1D9E75",
        weight:      1.5,
        fillColor:   "#1D9E75",
        fillOpacity: 0.08,
        dashArray:   "4,4",
      }).addTo(map);

      rect.bindTooltip(`
        <strong>${zone.name}</strong><br/>
        ${zone.county}<br/>
        <span style="color:#1D9E75">Coverage active</span>
      `, { sticky: true });

      zonesRef.current.push(rect);
    });
  }, [mapReady, zones, activeLayer]);

  // ── Draw network nodes ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !nodes) return;
    const { map, L } = leafletRef.current;

    // Clear old node markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    if (!activeLayer.has("nodes")) return;

    const nodeCoords: Record<string, [number,number]> = {
      "Nairobi CBD":    [-1.2864, 36.8200],
      "Westlands":      [-1.2686, 36.8070],
      "Kilimani":       [-1.2920, 36.7827],
      "Kasarani":       [-1.2210, 36.8957],
      "Thika Road":     [-1.2190, 36.8890],
      "Ruaka":          [-1.2100, 36.7920],
      "Karen":          [-1.3441, 36.7128],
      "Parklands":      [-1.2650, 36.8250],
    };

    nodes.forEach((node: any) => {
      const coords = nodeCoords[node.location] ?? [-1.2921 + Math.random() * 0.05, 36.8219 + Math.random() * 0.05];

      const color = node.status === "online" ? "#1D9E75" :
                    node.status === "degraded" ? "#BA7517" : "#E24B4A";

      const icon = L.divIcon({
        className: "",
        html: `
          <div style="
            width:24px;height:24px;border-radius:50%;
            background:${color};border:2px solid white;
            box-shadow:0 2px 6px rgba(0,0,0,0.3);
            display:flex;align-items:center;justify-content:center;
          ">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
              <path d="M1 6l11 11L23 6" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round"/>
              <circle cx="12" cy="20" r="2" fill="white"/>
            </svg>
          </div>
          ${node.status !== "online" ? `<div style="position:absolute;top:-4px;right:-4px;width:10px;height:10px;border-radius:50%;background:#E24B4A;border:1.5px solid white;animation:pulse 1.5s infinite;"></div>` : ""}
        `,
        iconSize:   [24, 24],
        iconAnchor: [12, 12],
      });

      const marker = L.marker(coords, { icon }).addTo(map);

      marker.bindPopup(`
        <div style="font-family:sans-serif;min-width:180px;">
          <div style="font-weight:600;font-size:13px;margin-bottom:6px;">${node.name}</div>
          <div style="font-size:12px;color:#6b7280;">${node.location}</div>
          <div style="margin-top:8px;display:flex;align-items:center;gap:6px;">
            <span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block;"></span>
            <span style="font-size:12px;text-transform:capitalize;">${node.status}</span>
          </div>
          <div style="margin-top:6px;font-size:11px;color:#9ca3af;">IP: ${node.ip_address}</div>
          <div style="margin-top:4px;font-size:11px;color:#9ca3af;">Type: ${node.type}</div>
        </div>
      `);

      marker.on("click", () => setSelectedNode(node));
      markersRef.current.push(marker);
    });
  }, [mapReady, nodes, activeLayer]);

  // ── Draw technician locations ──────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady) return;
    const { map, L } = leafletRef.current;

    if (!activeLayer.has("technicians") || !techLocations?.length) return;

    techLocations.forEach((tech: any) => {
      if (!tech.lat || !tech.lng) return;
      const icon = L.divIcon({
        className: "",
        html: `
          <div style="
            width:28px;height:28px;border-radius:50%;
            background:#378ADD;border:2px solid white;
            box-shadow:0 2px 6px rgba(0,0,0,0.3);
            display:flex;align-items:center;justify-content:center;
            color:white;font-size:11px;font-weight:600;
          ">
            ${(tech.name ?? "T").slice(0,1).toUpperCase()}
          </div>
        `,
        iconSize:   [28, 28],
        iconAnchor: [14, 14],
      });

      const m = L.marker([tech.lat, tech.lng], { icon }).addTo(map);
      m.bindTooltip(`<strong>${tech.name}</strong><br/>${tech.status ?? "On duty"}`);
      markersRef.current.push(m);
    });
  }, [mapReady, techLocations, activeLayer]);

  const toggleLayer = (layer: LayerToggle) => {
    setActiveLayer(prev => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  };

  const nodeStats = {
    online:   nodes?.filter(n => n.status === "online").length   ?? 0,
    degraded: nodes?.filter(n => n.status === "degraded").length ?? 0,
    down:     nodes?.filter(n => n.status === "down").length     ?? 0,
  };

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Coverage zones</div>
          <div className="text-xl font-bold text-gray-900">{zones?.length ?? 0}</div>
          <div className="text-xs text-brand-600 mt-0.5">Active areas</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Nodes online</div>
          <div className="text-xl font-bold text-green-600">{nodeStats.online}</div>
          <div className="text-xs text-gray-400 mt-0.5">of {nodes?.length ?? 0} total</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Degraded / down</div>
          <div className="text-xl font-bold text-red-500">{nodeStats.degraded + nodeStats.down}</div>
          <div className="text-xs text-gray-400 mt-0.5">{nodeStats.degraded} degraded · {nodeStats.down} down</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Technicians active</div>
          <div className="text-xl font-bold text-blue-600">{techLocations?.length ?? 0}</div>
          <div className="text-xs text-gray-400 mt-0.5">On duty now</div>
        </div>
      </div>

      {/* Map + sidebar */}
      <div className="flex gap-4">
        {/* Layer controls */}
        <div className="w-48 flex-shrink-0 space-y-3">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Layers</div>
            {([
              { id: "zones",       label: "Coverage zones",  color: "#1D9E75" },
              { id: "nodes",       label: "Network nodes",   color: "#378ADD" },
              { id: "customers",   label: "Customers",       color: "#BA7517" },
              { id: "technicians", label: "Technicians",     color: "#7F77DD" },
            ] as { id: LayerToggle; label: string; color: string }[]).map(layer => (
              <button key={layer.id}
                onClick={() => toggleLayer(layer.id)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm mb-1 transition-colors",
                  activeLayer.has(layer.id)
                    ? "bg-gray-900 text-white"
                    : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                )}>
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: layer.color }} />
                {layer.label}
              </button>
            ))}
          </div>

          {/* Node list */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex justify-between items-center mb-3">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Nodes</div>
              <button onClick={() => refetchNodes()}
                className="text-gray-400 hover:text-gray-600">
                <RefreshCw size={12} />
              </button>
            </div>
            <div className="space-y-2">
              {nodes?.map((node: any) => (
                <button key={node.id}
                  onClick={() => setSelectedNode(node)}
                  className="w-full flex items-center gap-2 text-xs text-left hover:bg-gray-50 rounded-lg px-2 py-1.5 transition-colors">
                  <span className={cn(
                    "w-2 h-2 rounded-full flex-shrink-0",
                    node.status === "online"   ? "bg-green-500" :
                    node.status === "degraded" ? "bg-amber-500" : "bg-red-500"
                  )} />
                  <span className="truncate text-gray-700">{node.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Map */}
        <div className="flex-1 min-h-0">
          {/* Leaflet CSS */}
          <link
            rel="stylesheet"
            href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"
          />

          <div className="relative bg-white border border-gray-200 rounded-xl overflow-hidden" style={{ height: 520 }}>
            {nodesLoading && (
              <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-10">
                <PageSpinner />
              </div>
            )}
            <div ref={mapRef} className="w-full h-full" />

            {/* Legend */}
            <div className="absolute bottom-4 left-4 bg-white rounded-xl border border-gray-200 shadow-md p-3 z-[1000] text-xs space-y-1.5">
              {[
                { color: "#1D9E75", label: "Online node"   },
                { color: "#BA7517", label: "Degraded node" },
                { color: "#E24B4A", label: "Node down"     },
                { color: "#1D9E75", label: "Coverage zone", dashed: true },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ background: l.color, border: l.dashed ? `1.5px dashed ${l.color}` : "none" }} />
                  <span className="text-gray-600">{l.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Selected node detail */}
      {selectedNode && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-semibold text-gray-900">{selectedNode.name}</div>
              <div className="text-sm text-gray-500 mt-0.5">{selectedNode.location} · {selectedNode.type}</div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={
                selectedNode.status === "online"   ? "success" :
                selectedNode.status === "degraded" ? "warning" : "danger"
              }>{selectedNode.status}</Badge>
              <button onClick={() => setSelectedNode(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-400 mb-1">IP Address</div>
              <div className="font-mono font-medium">{selectedNode.ip_address}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-400 mb-1">Node type</div>
              <div className="font-medium capitalize">{selectedNode.type}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-400 mb-1">Last seen</div>
              <div className="font-medium">{selectedNode.last_seen_at ? new Date(selectedNode.last_seen_at).toLocaleTimeString() : "—"}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
