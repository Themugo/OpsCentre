"use client";
// ─── Finance & Reports Page ───────────────────────────────────────────────────

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createBrowserClient } from "@/lib/supabase";
import { formatKES } from "@/lib/utils";
import { StatCard, PageSpinner } from "@/components/ui";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  ResponsiveContainer,
} from "recharts";
import { Download, TrendingUp, TrendingDown, FileText } from "lucide-react";

type ExportType = "revenue" | "invoices" | "customers" | "field_jobs" | "tickets";

export default function ReportsPage() {
  const supabase = createBrowserClient();
  const now      = new Date();
  const year     = now.getFullYear();

  const [fromDate, setFromDate] = useState(`${year}-01-01`);
  const [toDate,   setToDate]   = useState(now.toISOString().slice(0, 10));
  const [exporting, setExporting] = useState<string | null>(null);

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: revenue, isLoading } = useQuery({
    queryKey: ["revenue", fromDate, toDate],
    queryFn: async () => {
      const { data } = await supabase
        .from("monthly_revenue")
        .select("*")
        .order("month", { ascending: true })
        .limit(24);
      return data ?? [];
    },
  });

  const { data: byPlan } = useQuery({
    queryKey: ["by-plan"],
    queryFn: async () => {
      const { data } = await supabase.from("revenue_by_plan_type").select("*");
      return data ?? [];
    },
  });

  const { data: arpu } = useQuery({
    queryKey: ["arpu"],
    queryFn: async () => {
      const { data } = await supabase
        .from("arpu_monthly")
        .select("*")
        .order("month", { ascending: true })
        .limit(12);
      return data ?? [];
    },
  });

  const { data: collection } = useQuery({
    queryKey: ["collection"],
    queryFn: async () => {
      const { data } = await supabase
        .from("collection_rate_monthly")
        .select("*")
        .order("month", { ascending: false })
        .limit(12);
      return data ?? [];
    },
  });

  const { data: churn } = useQuery({
    queryKey: ["churn"],
    queryFn: async () => {
      const { data } = await supabase
        .from("churn_summary")
        .select("*")
        .order("month", { ascending: true })
        .limit(12);
      return data ?? [];
    },
  });

  const { data: activeCount } = useQuery({
    queryKey: ["active-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("customers")
        .select("*", { count: "exact", head: true })
        .eq("status", "active");
      return count ?? 0;
    },
  });

  // ── Derived chart data ────────────────────────────────────────────────────
  const revenueChart = useMemo(() =>
    (revenue ?? []).map((r: any) => ({
      month:   new Date(r.month).toLocaleString("default", { month: "short", year: "2-digit" }),
      actual:  Math.round(r.total_kes / 1000),
      mpesa:   Math.round((r.mpesa_kes  ?? 0) / 1000),
      stripe:  Math.round((r.stripe_kes ?? 0) / 1000),
      cash:    Math.round((r.cash_kes   ?? 0) / 1000),
    })), [revenue]);

  // Linear regression forecast — 3 months ahead
  const forecast = useMemo(() => {
    const pts = (revenue ?? []).slice(-6);
    if (pts.length < 3) return [];
    const n   = pts.length;
    const xs  = pts.map((_: any, i: number) => i);
    const ys  = pts.map((r: any) => r.total_kes);
    const sx  = xs.reduce((a: number, b: number) => a + b, 0);
    const sy  = ys.reduce((a: number, b: number) => a + b, 0);
    const sxy = xs.reduce((s: number, x: number, i: number) => s + x * ys[i], 0);
    const sx2 = xs.reduce((s: number, x: number) => s + x * x, 0);
    const m   = (n * sxy - sx * sy) / (n * sx2 - sx * sx);
    const b0  = (sy - m * sx) / n;
    const last = new Date(pts[pts.length - 1].month);
    return [1, 2, 3].map(offset => {
      const d = new Date(last);
      d.setMonth(d.getMonth() + offset);
      return {
        month:    d.toLocaleString("default", { month: "short", year: "2-digit" }),
        actual:   null,
        forecast: Math.max(0, Math.round((b0 + m * (n - 1 + offset)) / 1000)),
      };
    });
  }, [revenue]);

  const combinedChart = useMemo(() => [
    ...revenueChart.map(r => ({ ...r, forecast: null })),
    ...forecast,
  ], [revenueChart, forecast]);

  const arpuChart = useMemo(() =>
    (arpu ?? []).map((r: any) => ({
      month: new Date(r.month).toLocaleString("default", { month: "short", year: "2-digit" }),
      arpu:  Math.round(r.arpu_kes),
      subs:  r.paying_customers,
    })), [arpu]);

  const churnChart = useMemo(() =>
    (churn ?? []).map((r: any) => ({
      month:   new Date(r.month).toLocaleString("default", { month: "short" }),
      churned: r.churned_count,
      rate:    r.churn_rate_pct,
    })), [churn]);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const thisMonth    = (revenue ?? []).at(-1) as any;
  const lastMonth    = (revenue ?? []).at(-2) as any;
  const growth       = thisMonth && lastMonth && lastMonth.total_kes > 0
    ? Math.round(((thisMonth.total_kes - lastMonth.total_kes) / lastMonth.total_kes) * 100)
    : null;
  const latestArpu   = (arpu ?? []).at(-1) as any;
  const latestColl   = (collection ?? []).at(0) as any;
  const latestChurn  = (churn ?? []).at(-1) as any;
  const periodRevenue = (revenue ?? []).reduce((s: number, r: any) => s + r.total_kes, 0);

  // ── Export ────────────────────────────────────────────────────────────────
  async function handleExport(type: ExportType, format: "csv" | "pdf") {
    setExporting(type + format);
    const url = `/api/reports/export?type=${type}&format=${format}&from=${fromDate}&to=${toDate}`;
    try {
      const res  = await fetch(url);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const link = document.createElement("a");
      link.href     = URL.createObjectURL(blob);
      link.download = `fibercrm_${type}_${toDate}.${format === "pdf" ? "html" : "csv"}`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch {
      alert("Export failed — please try again.");
    } finally {
      setExporting(null);
    }
  }

  const EXPORTS: { type: ExportType; label: string }[] = [
    { type: "revenue",    label: "Revenue"    },
    { type: "invoices",   label: "Invoices"   },
    { type: "customers",  label: "Customers"  },
    { type: "field_jobs", label: "Field jobs" },
    { type: "tickets",    label: "Tickets"    },
  ];

  const QUICK_RANGES = [
    { label: "This month",
      from: `${year}-${String(now.getMonth()+1).padStart(2,"0")}-01`,
      to:   toDate },
    { label: "This year",   from: `${year}-01-01`,      to: toDate       },
    { label: "Last year",   from: `${year-1}-01-01`,    to: `${year-1}-12-31` },
    { label: "Last 6 mo",
      from: new Date(now.getFullYear(), now.getMonth()-5, 1).toISOString().slice(0,10),
      to:   toDate },
  ];

  const planColors: Record<string, string> = {
    home: "#1D9E75", business: "#378ADD", estate: "#BA7517",
  };

  if (isLoading) return <PageSpinner />;

  return (
    <div className="space-y-5">

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-gray-600 font-medium flex-shrink-0">
          <FileText size={14} />
          Date range
        </div>

        <input type="date" className="input w-36 text-sm py-1.5"
          value={fromDate} max={toDate}
          onChange={e => setFromDate(e.target.value)} />
        <span className="text-gray-400 text-sm">→</span>
        <input type="date" className="input w-36 text-sm py-1.5"
          value={toDate} min={fromDate}
          onChange={e => setToDate(e.target.value)} />

        <div className="flex gap-1 flex-wrap">
          {QUICK_RANGES.map(r => (
            <button key={r.label}
              onClick={() => { setFromDate(r.from); setToDate(r.to); }}
              className="text-xs px-2 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-brand-light hover:border-brand-300 hover:text-brand-700 transition-colors">
              {r.label}
            </button>
          ))}
        </div>

        {/* Export buttons */}
        <div className="ml-auto flex gap-2 flex-wrap">
          {EXPORTS.map(({ type, label }) => (
            <div key={type} className="relative group">
              <button
                className="btn-secondary text-xs flex items-center gap-1"
                disabled={!!exporting}>
                <Download size={11} />
                {exporting?.startsWith(type) ? "…" : label}
              </button>
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto z-20 min-w-[90px] transition-opacity">
                <button onClick={() => handleExport(type, "csv")}
                  className="block w-full text-left px-3 py-2 text-xs hover:bg-gray-50 first:rounded-t-lg">
                  Download CSV
                </button>
                <button onClick={() => handleExport(type, "pdf")}
                  className="block w-full text-left px-3 py-2 text-xs hover:bg-gray-50 last:rounded-b-lg">
                  Download PDF
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── KPI row ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Revenue (period)"
          value={formatKES(periodRevenue)}
          change={growth !== null ? `${growth >= 0 ? "+" : ""}${growth}% vs prev month` : undefined}
          changeUp={(growth ?? 0) >= 0}
        />
        <StatCard
          label="Active subscribers"
          value={(activeCount ?? 0).toLocaleString()}
          changeUp
        />
        <StatCard
          label="ARPU (latest month)"
          value={latestArpu ? formatKES(latestArpu.arpu_kes) : "—"}
          change="avg revenue per user"
          changeUp
        />
        <StatCard
          label="Collection rate"
          value={latestColl ? `${latestColl.collection_rate_pct}%` : "—"}
          change={latestColl ? `${formatKES(latestColl.collected_kes)} collected` : undefined}
          changeUp={(latestColl?.collection_rate_pct ?? 0) >= 80}
        />
      </div>

      {/* ── Revenue + 3-month forecast ───────────────────────────────────── */}
      <div className="card">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Revenue + 3-month forecast</h2>
            <p className="text-xs text-gray-400 mt-0.5">Solid = actual · Dashed = linear regression forecast</p>
          </div>
          {growth !== null && (
            <div className={`flex items-center gap-1.5 text-sm font-semibold ${growth >= 0 ? "text-green-600" : "text-red-500"}`}>
              {growth >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {growth >= 0 ? "+" : ""}{growth}% MoM
            </div>
          )}
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={combinedChart} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#1D9E75" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#1D9E75" stopOpacity={0}   />
              </linearGradient>
              <linearGradient id="foreGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#378ADD" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#378ADD" stopOpacity={0}    />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false}
              tickFormatter={v => `${v}K`} width={55} />
            <Tooltip formatter={(v: any, name: string) => [`KES ${v}K`, name]} />
            <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
            <Area type="monotone" dataKey="actual"   name="Actual (KES '000)"
              stroke="#1D9E75" fill="url(#revGrad)" strokeWidth={2.5}
              dot={{ r: 3 }} activeDot={{ r: 5 }} />
            <Area type="monotone" dataKey="forecast" name="Forecast (KES '000)"
              stroke="#378ADD" fill="url(#foreGrad)" strokeWidth={2}
              strokeDasharray="6 3" dot={{ r: 4, fill: "#378ADD" }} connectNulls={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* ARPU + subscriber growth */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">ARPU & paying subscribers</h2>
          <p className="text-xs text-gray-400 mb-4">Track revenue-per-user alongside subscriber growth</p>
          <ResponsiveContainer width="100%" height={190}>
            <LineChart data={arpuChart} margin={{ top: 5, right: 20, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="l" tick={{ fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={v => `${formatKES(v)}`} width={75} />
              <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10 }}
                axisLine={false} tickLine={false} />
              <Tooltip />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              <Line yAxisId="l" type="monotone" dataKey="arpu" name="ARPU (KES)"
                stroke="#378ADD" strokeWidth={2} dot={{ r: 3 }} />
              <Line yAxisId="r" type="monotone" dataKey="subs" name="Subscribers"
                stroke="#1D9E75" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Revenue by plan */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Revenue by plan type (current month)</h2>
          <div className="space-y-4">
            {(byPlan ?? []).map((r: any) => {
              const total = (byPlan ?? []).reduce((s: number, x: any) => s + Number(x.total_kes), 0);
              const pct   = total > 0 ? Math.round((r.total_kes / total) * 100) : 0;
              const color = planColors[r.plan_type] ?? "#6b7280";
              return (
                <div key={r.plan_name}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <div>
                      <span className="font-medium text-gray-900">{r.plan_name}</span>
                      <span className="text-xs text-gray-400 ml-2">{r.active_subscriptions} subs</span>
                    </div>
                    <span className="font-semibold text-gray-900">{formatKES(r.total_kes)}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">{pct}% of total</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* Collection rate */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Monthly collection rate</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Month","Billed","Collected","Rate"].map(h => (
                    <th key={h} className="text-left py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(collection ?? []).slice(0, 8).map((r: any) => (
                  <tr key={r.month} className="border-b border-gray-50">
                    <td className="py-2.5 text-gray-600">
                      {new Date(r.month).toLocaleString("default", { month: "short", year: "2-digit" })}
                    </td>
                    <td className="py-2.5 text-gray-700">{formatKES(r.total_billed_kes)}</td>
                    <td className="py-2.5 text-gray-700">{formatKES(r.collected_kes)}</td>
                    <td className={`py-2.5 font-semibold ${r.collection_rate_pct >= 80 ? "text-green-600" : "text-red-500"}`}>
                      {r.collection_rate_pct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Churn chart */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Customer churn</h2>
          <p className="text-xs text-gray-400 mb-4">
            Latest rate:&nbsp;
            <span className={`font-semibold ${(latestChurn?.churn_rate_pct ?? 0) > 3 ? "text-red-500" : "text-green-600"}`}>
              {latestChurn?.churn_rate_pct ?? "—"}%
            </span>
            {latestChurn && ` · ${latestChurn.churned_count} customers lost`}
          </p>
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={churnChart} margin={{ top: 0, right: 5, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(v: any, name: string) =>
                  name === "rate" ? [`${v}%`, "Churn rate"] : [v, "Churned"]}
              />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="churned" name="Churned customers" fill="#FECACA"
                stroke="#E24B4A" strokeWidth={1} radius={[3,3,0,0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Payment method breakdown */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Revenue by payment method (current month)</h2>
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "M-Pesa",  key: "mpesa",  color: "#1D9E75" },
            { label: "Stripe",  key: "stripe", color: "#378ADD" },
            { label: "Cash",    key: "cash",   color: "#BA7517" },
            { label: "Bank",    key: "bank",   color: "#7F77DD" },
          ].map(m => {
            const latest = (revenue ?? []).at(-1) as any;
            const amt    = latest?.[`${m.key}_kes`] ?? 0;
            const total  = latest?.total_kes ?? 1;
            const pct    = Math.round((amt / total) * 100);
            return (
              <div key={m.key} className="bg-gray-50 rounded-xl p-4 text-center">
                <div className="text-lg font-bold text-gray-900">{formatKES(amt)}</div>
                <div className="text-xs text-gray-500 mt-0.5">{m.label}</div>
                <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: m.color }} />
                </div>
                <div className="text-xs text-gray-400 mt-1">{pct}%</div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
