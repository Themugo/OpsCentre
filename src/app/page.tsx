// src/app/page.tsx
// Root page — middleware handles the redirect, but this is the fallback.
import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/dashboard");
}
