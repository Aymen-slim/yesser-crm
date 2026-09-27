/**
 * Removes demo CRM rows and demo auth accounts (demo@yassir.studio, sami@yassir.studio).
 *
 *   npm run clear-demo
 */
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const DEMO_EMAILS = ["demo@yassir.studio", "sami@yassir.studio"];

for (const file of [".env", ".env.local"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env or .env.local");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function clearBusinessData() {
  const tables = [
    "notes",
    "files",
    "tasks",
    "payments",
    "wedding_assignments",
    "expenses",
    "weddings",
    "leads",
    "clients",
    "packages",
  ];
  for (const table of tables) {
    const column = table === "wedding_assignments" ? "wedding_id" : "id";
    const { error } = await admin.from(table).delete().neq(column, "00000000-0000-0000-0000-000000000000");
    if (error) throw error;
  }
}

async function findUserIdByEmail(email) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id ?? null;
}

async function main() {
  console.log("Clearing CRM tables…");
  await clearBusinessData();

  for (const email of DEMO_EMAILS) {
    const id = await findUserIdByEmail(email);
    if (!id) {
      console.log(`No auth user for ${email} — skipped`);
      continue;
    }
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw error;
    console.log(`Deleted login ${email}`);
  }

  console.log("\nDemo data removed.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
