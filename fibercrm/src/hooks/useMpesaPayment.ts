"use client";
// ─── useMpesaPayment hook ─────────────────────────────────────────────────────
// Manages the full STK Push lifecycle: idle → requesting → pending → done/failed
// Reusable in both the staff dashboard and customer portal.

import { useState, useCallback, useRef, useEffect } from "react";

export type MpesaStatus = "idle" | "requesting" | "pending" | "success" | "failed" | "timeout";

export interface MpesaState {
  status:            MpesaStatus;
  message:           string;
  checkoutRequestId: string | null;
  receipt:           string | null;
  elapsed:           number;   // seconds since STK sent
}

const INITIAL: MpesaState = {
  status:            "idle",
  message:           "",
  checkoutRequestId: null,
  receipt:           null,
  elapsed:           0,
};

export interface UseMpesaOptions {
  pollIntervalMs?: number;   // default 4000
  timeoutSecs?:    number;   // default 90
  onSuccess?:      (receipt: string) => void;
  onFailure?:      (message: string) => void;
}

export interface InitiateParams {
  invoiceId:     string;
  invoiceNumber: string;
  phone:         string;
  amountKes:     number;
}

export function useMpesaPayment(opts: UseMpesaOptions = {}) {
  const { pollIntervalMs = 4_000, timeoutSecs = 90, onSuccess, onFailure } = opts;

  const [state, setState]    = useState<MpesaState>(INITIAL);
  const pollRef              = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef           = useRef<ReturnType<typeof setInterval> | null>(null);
  const checkoutRef          = useRef<string | null>(null);
  const abortRef             = useRef(false);

  const clearTimers = useCallback(() => {
    if (pollRef.current)    clearInterval(pollRef.current);
    if (elapsedRef.current) clearInterval(elapsedRef.current);
    pollRef.current    = null;
    elapsedRef.current = null;
  }, []);

  useEffect(() => () => { abortRef.current = true; clearTimers(); }, [clearTimers]);

  // ── Poll for transaction result ─────────────────────────────────────────────
  const pollStatus = useCallback(async (checkoutRequestId: string) => {
    try {
      const res = await fetch("/api/mpesa/status", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ checkoutRequestId }),
      });
      if (!res.ok || abortRef.current) return;

      const data: { status: string; receipt?: string; message?: string } = await res.json();

      if (data.status === "success") {
        clearTimers();
        setState(s => ({ ...s, status: "success", receipt: data.receipt ?? null, message: "Payment received!" }));
        onSuccess?.(data.receipt ?? "");
      } else if (data.status === "failed") {
        clearTimers();
        setState(s => ({ ...s, status: "failed", message: data.message ?? "Payment failed. Please try again." }));
        onFailure?.(data.message ?? "Payment failed");
      }
      // "pending" → keep polling
    } catch {
      // Network blip — keep polling
    }
  }, [clearTimers, onSuccess, onFailure]);

  // ── Initiate payment ────────────────────────────────────────────────────────
  const initiatePayment = useCallback(async (params: InitiateParams) => {
    abortRef.current = false;
    setState({ ...INITIAL, status: "requesting", message: "Sending payment request…" });

    try {
      const res = await fetch("/api/mpesa/pay", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(params),
      });
      const data = await res.json();

      if (!res.ok || !data.checkoutRequestId) {
        setState({ ...INITIAL, status: "failed", message: data.error ?? "Failed to send payment request." });
        onFailure?.(data.error);
        return;
      }

      checkoutRef.current = data.checkoutRequestId;
      setState({
        status:            "pending",
        checkoutRequestId: data.checkoutRequestId,
        message:           data.message ?? "Check your phone for an M-Pesa prompt.",
        receipt:           null,
        elapsed:           0,
      });

      // Elapsed counter
      elapsedRef.current = setInterval(() => {
        if (abortRef.current) { clearTimers(); return; }
        setState(s => {
          const next = s.elapsed + 1;
          if (next >= timeoutSecs) {
            clearTimers();
            onFailure?.("Payment request timed out");
            return { ...s, elapsed: next, status: "timeout", message: "No response from M-Pesa. Please try again." };
          }
          return { ...s, elapsed: next };
        });
      }, 1_000);

      // Polling
      pollRef.current = setInterval(() => {
        if (checkoutRef.current && !abortRef.current) {
          pollStatus(checkoutRef.current);
        }
      }, pollIntervalMs);

    } catch (err: any) {
      const msg = err?.message ?? "Network error";
      setState({ ...INITIAL, status: "failed", message: msg });
      onFailure?.(msg);
    }
  }, [pollStatus, clearTimers, pollIntervalMs, timeoutSecs, onFailure]);

  // ── Reset ───────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    abortRef.current    = true;
    checkoutRef.current = null;
    clearTimers();
    setState(INITIAL);
  }, [clearTimers]);

  return { state, initiatePayment, reset };
}
