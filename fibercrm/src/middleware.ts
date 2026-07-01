// ─── Middleware — Auth guard + role-based routing ─────────────────────────────
// Runs on every request. Refreshes session cookie and redirects unauthenticated
// users. Also enforces role-based access to /dashboard, /portal, /field.

import { NextRequest, NextResponse } from "next/server";
import { createMiddlewareClient } from "@/lib/supabase";

// Public paths — no auth required
const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/onboarding",
  "/api/mpesa",
  "/api/onboarding",
  "/api/whatsapp",
  "/api/health",
];

// Role → allowed path prefix
const ROLE_HOME: Record<string, string> = {
  admin:   "/dashboard",
  billing: "/dashboard",
  sales:   "/dashboard",
  support: "/dashboard",
  tech:    "/field",
  customer:"/portal",
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow public paths and static files
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  const supabase = createMiddlewareClient(request, response);

  const { data: { session } } = await supabase.auth.getSession();

  // Not logged in → redirect to login
  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Fetch user role
  const { data: user } = await supabase
    .from("users")
    .select("role")
    .eq("id", session.user.id)
    .single();

  const role = user?.role ?? "customer";
  const home = ROLE_HOME[role] ?? "/dashboard";

  // Root → redirect to role home
  if (pathname === "/") {
    return NextResponse.redirect(new URL(home, request.url));
  }

  // Enforce role boundaries
  if (pathname.startsWith("/dashboard") && role === "tech") {
    return NextResponse.redirect(new URL("/field", request.url));
  }
  if (pathname.startsWith("/field") && !["tech", "admin"].includes(role)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  if (pathname.startsWith("/portal") && role !== "customer" && role !== "admin") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
