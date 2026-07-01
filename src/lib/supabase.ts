// ─── Supabase Client Factories ────────────────────────────────────────────────
// Three variants required by @supabase/ssr:
//   1. createBrowserClient  — React components / client hooks
//   2. createServerClient   — Server Components, Route Handlers, Server Actions
//   3. createMiddlewareClient — middleware.ts only

import { createBrowserClient as _browser } from "@supabase/ssr";
import { createServerClient as _server, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/types/supabase";

// ── 1. Browser (client components) ───────────────────────────────────────────
export function createBrowserClient() {
  return _browser<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// ── 2. Server (server components, route handlers, server actions) ─────────────
export async function createServerComponentClient() {
  const cookieStore = await cookies();
  return _server<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) {
          try { cookieStore.set({ name, value, ...options }); } catch {}
        },
        remove(name: string, options: CookieOptions) {
          try { cookieStore.set({ name, value: "", ...options }); } catch {}
        },
      },
    }
  );
}

// ── 3. Service role (bypasses RLS — server only, never expose to client) ──────
export function createServiceClient() {
  return _browser<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ── 4. Middleware client ───────────────────────────────────────────────────────
export function createMiddlewareClient(
  request: NextRequest,
  response: NextResponse
) {
  return _server<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return request.cookies.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );
}
