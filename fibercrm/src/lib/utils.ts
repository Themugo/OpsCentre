// ─── Utility Functions ────────────────────────────────────────────────────────

import { clsx, type ClassValue } from "clsx";
import { format, formatDistanceToNow } from "date-fns";

// ── Tailwind class merging ────────────────────────────────────────────────────
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

// ── Currency ──────────────────────────────────────────────────────────────────
export function formatKES(amount: number): string {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// ── Dates ─────────────────────────────────────────────────────────────────────
export function formatDate(date: string | Date): string {
  return format(new Date(date), "dd MMM yyyy");
}

export function formatDateTime(date: string | Date): string {
  return format(new Date(date), "dd MMM yyyy, HH:mm");
}

export function timeAgo(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

// ── Status badge helpers ──────────────────────────────────────────────────────
export function invoiceStatusClass(status: string): string {
  return {
    paid:    "badge-success",
    pending: "badge-warning",
    overdue: "badge-danger",
    draft:   "badge-gray",
    sent:    "badge-info",
  }[status] ?? "badge-gray";
}

export function jobStatusClass(status: string): string {
  return {
    scheduled:   "badge-gray",
    en_route:    "badge-warning",
    in_progress: "badge-info",
    done:        "badge-success",
    cancelled:   "badge-danger",
  }[status] ?? "badge-gray";
}

export function ticketStatusClass(status: string): string {
  return {
    open:        "badge-danger",
    in_progress: "badge-warning",
    resolved:    "badge-success",
    closed:      "badge-gray",
  }[status] ?? "badge-gray";
}

export function priorityClass(priority: string): string {
  return {
    critical: "badge-danger",
    high:     "badge-warning",
    medium:   "badge-info",
    low:      "badge-gray",
  }[priority] ?? "badge-gray";
}

export function nodeStatusClass(status: string): string {
  return {
    online:   "badge-success",
    degraded: "badge-warning",
    down:     "badge-danger",
  }[status] ?? "badge-gray";
}

// ── Initials ──────────────────────────────────────────────────────────────────
export function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

// ── Phone normalisation ───────────────────────────────────────────────────────
export function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("254") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 10) return `254${digits.slice(1)}`;
  if (digits.startsWith("7") && digits.length === 9) return `254${digits}`;
  throw new Error(`Cannot normalise phone number: ${raw}`);
}

// ── Truncate ──────────────────────────────────────────────────────────────────
export function truncate(str: string, len = 40): string {
  return str.length > len ? str.slice(0, len) + "…" : str;
}
