#!/usr/bin/env node
// ─── Dev Seed Script ──────────────────────────────────────────────────────────
// Creates auth users for each staff role so you can test every role locally.
// Run: npx ts-node supabase/seed/index.ts
//
// Credentials after seeding:
//   admin@fibercrm.co.ke      / Password123!
//   billing@fibercrm.co.ke    / Password123!
//   sales@fibercrm.co.ke      / Password123!
//   support@fibercrm.co.ke    / Password123!
//   tech@fibercrm.co.ke       / Password123!
//   customer@fibercrm.co.ke   / Password123!

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SEED_USERS = [
  { email: "admin@fibercrm.co.ke",    name: "Admin User",     role: "admin"    },
  { email: "billing@fibercrm.co.ke",  name: "Billing Team",   role: "billing"  },
  { email: "sales@fibercrm.co.ke",    name: "Sales Rep",      role: "sales"    },
  { email: "support@fibercrm.co.ke",  name: "Support Agent",  role: "support"  },
  { email: "tech@fibercrm.co.ke",     name: "James Mwangi",   role: "tech"     },
  { email: "customer@fibercrm.co.ke", name: "John Kariuki",   role: "customer" },
];

const PASSWORD = "Password123!";

async function seedUsers() {
  console.log("Seeding auth users...\n");

  for (const u of SEED_USERS) {
    // Check if user already exists
    const { data: existing } = await supabase.auth.admin.listUsers();
    const alreadyExists = existing?.users?.some(eu => eu.email === u.email);

    if (alreadyExists) {
      console.log(`SKIP  ${u.email} (already exists)`);
      continue;
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email:         u.email,
      password:      PASSWORD,
      email_confirm: true,
      user_metadata: { name: u.name, role: u.role },
    });

    if (error) {
      console.error(`FAIL  ${u.email}: ${error.message}`);
      continue;
    }

    // Update the users table row with the correct role
    // (the trigger creates it as 'support' by default)
    if (data.user) {
      await supabase
        .from("users")
        .update({ name: u.name, role: u.role })
        .eq("id", data.user.id);

      // If customer role, also create a customers row
      if (u.role === "customer") {
        await supabase.from("customers").upsert({
          id:     data.user.id,
          name:   u.name,
          email:  u.email,
          phone:  "0722000001",
          type:   "home",
          status: "active",
        }, { onConflict: "id" });
      }

      // If tech role, link to a technician in field_jobs
      if (u.role === "tech") {
        await supabase
          .from("field_jobs")
          .update({ technician_id: data.user.id })
          .is("technician_id", null)
          .limit(5);
      }
    }

    console.log(`OK    ${u.email} (${u.role})`);
  }

  console.log(`\nDone! All users use password: ${PASSWORD}`);
  console.log("\nLogin URLs:");
  console.log("  Staff:    http://localhost:3000/login → /dashboard");
  console.log("  Tech:     http://localhost:3000/login → /field");
  console.log("  Customer: http://localhost:3000/login → /portal");
}

seedUsers().catch(console.error);
