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
