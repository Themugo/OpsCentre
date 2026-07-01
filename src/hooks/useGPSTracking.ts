"use client";
// ─── useGPSTracking hook ──────────────────────────────────────────────────────
// Used in the field app to automatically send GPS location every 2 minutes.
// Respects battery by only tracking when on_duty.
// Call start() when technician begins their shift, stop() at end.

import { useState, useEffect, useRef, useCallback } from "react";

export type TrackingStatus = "off_duty" | "on_duty" | "en_route" | "at_site";

interface TrackingState {
  isTracking:  boolean;
  status:      TrackingStatus;
  lastUpdate:  Date | null;
  error:       string | null;
  batteryPct:  number | null;
}

const PUSH_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

export function useGPSTracking(currentJobId?: string) {
  const [state, setState] = useState<TrackingState>({
    isTracking: false,
    status:     "off_duty",
    lastUpdate: null,
    error:      null,
    batteryPct: null,
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchRef    = useRef<number | null>(null);
  const latestPos   = useRef<GeolocationPosition | null>(null);

  // ── Read battery level ────────────────────────────────────────────────────
  async function getBatteryLevel(): Promise<number | null> {
    try {
      if ("getBattery" in navigator) {
        const battery = await (navigator as any).getBattery();
        return Math.round(battery.level * 100);
      }
    } catch {}
    return null;
  }

  // ── Push location to API ──────────────────────────────────────────────────
  const pushLocation = useCallback(async (
    pos: GeolocationPosition,
    status: TrackingStatus,
    jobId?: string
  ) => {
    const battery = await getBatteryLevel();
    try {
      await fetch("/api/tracking", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat:          pos.coords.latitude,
          lng:          pos.coords.longitude,
          accuracyM:    pos.coords.accuracy,
          heading:      pos.coords.heading ?? undefined,
          speedKmh:     pos.coords.speed ? pos.coords.speed * 3.6 : undefined,
          status,
          currentJobId: jobId,
          batteryPct:   battery,
        }),
      });
      setState(s => ({ ...s, lastUpdate: new Date(), error: null, batteryPct: battery }));
    } catch (err: any) {
      setState(s => ({ ...s, error: "Failed to push location" }));
    }
  }, []);

  // ── Start tracking ────────────────────────────────────────────────────────
  const start = useCallback((status: TrackingStatus = "on_duty") => {
    if (!("geolocation" in navigator)) {
      setState(s => ({ ...s, error: "GPS not available on this device" }));
      return;
    }

    setState(s => ({ ...s, isTracking: true, status, error: null }));

    // Watch position for real-time heading/speed
    watchRef.current = navigator.geolocation.watchPosition(
      pos => { latestPos.current = pos; },
      err => setState(s => ({ ...s, error: `GPS: ${err.message}` })),
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 }
    );

    // Push on start immediately
    navigator.geolocation.getCurrentPosition(pos => {
      latestPos.current = pos;
      pushLocation(pos, status, currentJobId);
    });

    // Then push every PUSH_INTERVAL_MS
    intervalRef.current = setInterval(() => {
      if (latestPos.current) {
        pushLocation(latestPos.current, status, currentJobId);
      } else {
        navigator.geolocation.getCurrentPosition(pos => {
          latestPos.current = pos;
          pushLocation(pos, status, currentJobId);
        });
      }
    }, PUSH_INTERVAL_MS);
  }, [pushLocation, currentJobId]);

  // ── Stop tracking ─────────────────────────────────────────────────────────
  const stop = useCallback(async () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    intervalRef.current = null;
    watchRef.current    = null;

    // Push off_duty status
    if (latestPos.current) {
      await pushLocation(latestPos.current, "off_duty");
    }

    setState(s => ({ ...s, isTracking: false, status: "off_duty" }));
  }, [pushLocation]);

  // ── Update status ─────────────────────────────────────────────────────────
  const updateStatus = useCallback((newStatus: TrackingStatus) => {
    setState(s => ({ ...s, status: newStatus }));
    if (latestPos.current) {
      pushLocation(latestPos.current, newStatus, currentJobId);
    }
  }, [pushLocation, currentJobId]);

  // Cleanup on unmount
  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
  }, []);

  return { state, start, stop, updateStatus };
}
