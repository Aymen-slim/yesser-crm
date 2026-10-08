import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type QueryError = { code: string; message: string };

export function isMissingWhatsappColumn(error: QueryError): boolean {
  return (error.code === "42703" || error.code === "PGRST204") && /\bwhatsapp_phone\b/.test(error.message);
}

export async function getWhatsappPhones(
  supabase: Supabase,
  table: "clients" | "leads",
  ids: string[],
): Promise<Map<string, string | null>> {
  if (!ids.length) return new Map();
  const { data, error } = await supabase.from(table).select("id, whatsapp_phone").in("id", ids);
  if (error) {
    if (isMissingWhatsappColumn(error)) return new Map();
    console.error("WhatsApp lookup failed:", error.code);
    throw new Error("couple_contacts_failed");
  }
  return new Map((data ?? []).map((row) => [row.id, row.whatsapp_phone]));
}

const RECORD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function phoneMatchFilter(digits: string, whatsappIds: readonly string[]) {
  if (!/^\d{1,20}$/.test(digits)) return "";
  const ids = whatsappIds.filter((id) => RECORD_ID.test(id)).slice(0, 200);
  const parts = [`phone.ilike."%${digits}%"`];
  if (ids.length) parts.push(`id.in.(${ids.join(",")})`);
  return parts.join(",");
}

export async function findIdsByWhatsapp(
  supabase: Supabase,
  table: "clients" | "leads",
  digits: string,
): Promise<string[]> {
  if (!/^\d{1,20}$/.test(digits)) return [];
  const { data, error } = await supabase.from(table).select("id").ilike("whatsapp_phone", `%${digits}%`);
  if (error) {
    if (isMissingWhatsappColumn(error)) return [];
    console.error("WhatsApp search failed:", error.code);
    throw new Error("couples_failed");
  }
  return (data ?? []).map((row) => row.id).filter((id) => RECORD_ID.test(id)).slice(0, 200);
}
