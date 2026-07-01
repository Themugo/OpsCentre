// ─── Supabase Database Types ──────────────────────────────────────────────────
// Auto-generate the real version by running:
//   npx supabase gen types typescript --local > src/types/supabase.ts
//
// This file is a minimal stub so the project compiles before DB is set up.

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          name: string;
          email: string;
          role: "admin" | "billing" | "sales" | "support" | "tech" | "customer";
          is_active: boolean;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["users"]["Row"], "created_at">;
        Update: Partial<Database["public"]["Tables"]["users"]["Insert"]>;
      };
      customers: {
        Row: {
          id: string;
          name: string;
          email: string;
          phone: string;
          type: "home" | "business" | "estate";
          status: "active" | "suspended" | "churned";
          address_id: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["customers"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["customers"]["Insert"]>;
      };
      addresses: {
        Row: {
          id: string;
          street: string;
          area: string;
          county: string;
          lat: number | null;
          lng: number | null;
          coverage_zone_id: string | null;
        };
        Insert: Omit<Database["public"]["Tables"]["addresses"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["addresses"]["Insert"]>;
      };
      service_plans: {
        Row: {
          id: string;
          name: string;
          type: "home" | "business" | "estate";
          speed_down_mbps: number;
          speed_up_mbps: number;
          price_kes: number;
          billing_cycle: "monthly" | "quarterly" | "annual";
          is_active: boolean;
        };
        Insert: Omit<Database["public"]["Tables"]["service_plans"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["service_plans"]["Insert"]>;
      };
      subscriptions: {
        Row: {
          id: string;
          customer_id: string;
          plan_id: string;
          status: "active" | "suspended" | "cancelled";
          start_date: string;
          next_billing_date: string;
          static_ip: string | null;
        };
        Insert: Omit<Database["public"]["Tables"]["subscriptions"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["subscriptions"]["Insert"]>;
      };
      invoices: {
        Row: {
          id: string;
          invoice_no: string;
          subscription_id: string;
          amount_kes: number;
          status: "draft" | "sent" | "paid" | "overdue" | "pending";
          due_date: string;
          paid_at: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["invoices"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["invoices"]["Insert"]>;
      };
      payments: {
        Row: {
          id: string;
          invoice_id: string;
          amount_kes: number;
          method: "mpesa" | "stripe" | "cash" | "bank";
          mpesa_ref: string | null;
          paid_at: string;
          recorded_by: string | null;
        };
        Insert: Omit<Database["public"]["Tables"]["payments"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["payments"]["Insert"]>;
      };
      mpesa_transactions: {
        Row: {
          id: string;
          invoice_id: string;
          phone: string;
          amount_kes: number;
          checkout_request_id: string | null;
          merchant_request_id: string | null;
          status: "pending" | "success" | "failed" | "timeout";
          mpesa_receipt: string | null;
          result_code: number | null;
          result_desc: string | null;
          initiated_at: string;
          completed_at: string | null;
        };
        Insert: Omit<Database["public"]["Tables"]["mpesa_transactions"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["mpesa_transactions"]["Insert"]>;
      };
      field_jobs: {
        Row: {
          id: string;
          type: "installation" | "repair" | "survey" | "upgrade";
          customer_id: string;
          technician_id: string | null;
          status: "scheduled" | "en_route" | "in_progress" | "done" | "cancelled";
          scheduled_at: string;
          completed_at: string | null;
          notes: string | null;
        };
        Insert: Omit<Database["public"]["Tables"]["field_jobs"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["field_jobs"]["Insert"]>;
      };
      network_nodes: {
        Row: {
          id: string;
          name: string;
          type: "core" | "distribution" | "access";
          location: string;
          ip_address: string;
          status: "online" | "degraded" | "down";
          last_seen_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["network_nodes"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["network_nodes"]["Insert"]>;
      };
      node_metrics: {
        Row: {
          id: string;
          node_id: string;
          throughput_mbps: number;
          latency_ms: number;
          packet_loss_pct: number;
          recorded_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["node_metrics"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["node_metrics"]["Insert"]>;
      };
      support_tickets: {
        Row: {
          id: string;
          customer_id: string;
          assigned_to: string | null;
          category: "billing" | "technical" | "general";
          priority: "low" | "medium" | "high" | "critical";
          status: "open" | "in_progress" | "resolved" | "closed";
          subject: string;
          description: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["support_tickets"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["support_tickets"]["Insert"]>;
      };
      leads: {
        Row: {
          id: string;
          name: string;
          phone: string;
          email: string | null;
          source: "web" | "referral" | "field" | "agent";
          stage: "new" | "qualified" | "proposal" | "won" | "lost";
          assigned_to: string | null;
          converted_at: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["leads"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["leads"]["Insert"]>;
      };
      audit_logs: {
        Row: {
          id: string;
          user_id: string;
          action: string;
          table_name: string;
          record_id: string;
          diff: Json;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["audit_logs"]["Row"], "id" | "created_at">;
        Update: never;
      };
    };
    Views: {
      stale_pending_transactions: { Row: Record<string, unknown> };
      mpesa_revenue_summary: { Row: Record<string, unknown> };
    };
    Functions: Record<string, unknown>;
    Enums: Record<string, unknown>;
  };
}
