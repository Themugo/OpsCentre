"use client";
// ─── useCurrentUser hook ──────────────────────────────────────────────────────
// Returns the authenticated user + their staff/customer profile.
// Safe to use in any client component.

import { useContext } from "react";
import { useAuth } from "@/components/ui/Providers";

export function useCurrentUser() {
  const { user, profile, loading } = useAuth();

  return {
    user,
    profile,
    loading,
    isAdmin:    profile?.role === "admin",
    isBilling:  profile?.role === "billing",
    isSales:    profile?.role === "sales",
    isSupport:  profile?.role === "support",
    isTech:     profile?.role === "tech",
    isCustomer: profile?.role === "customer",
    can: (roles: string[]) => !!profile && roles.includes(profile.role),
  };
}
