import { daysAgoInTunis, formatDate, one } from "@/lib/constants";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type CrewJob = {
  weddingId: string;
  weddingDate: string;
  couple: string;
  role: string;
  pay: number;
  paidAt: string | null;
};

type ClientName = { partner_one_name: string; partner_two_name: string };

export async function crewJobs(
  supabase: Supabase,
  range: { start: string; end: string } | null,
  memberId?: string,
  unnamed = "Wedding",
) {
  let query = supabase
    .from("wedding_assignments")
    .select(
      "member_id, role_on_day, weddings!inner(id, wedding_date, status, clients(partner_one_name, partner_two_name)), assignment_pay(amount_millimes, paid_at)",
      { count: "exact" },
    )
    .neq("weddings.status", "cancelled")
    .order("wedding_id")
    .order("member_id");
  if (range) query = query.gte("weddings.wedding_date", range.start).lt("weddings.wedding_date", range.end);
  if (memberId) query = query.eq("member_id", memberId);

  const byMember = new Map<string, CrewJob[]>();
  const batchSize = 1000;
  let offset = 0;
  while (true) {
    const { data, error, count } = await query.range(offset, offset + batchSize - 1);
    if (error) {
      console.error("Crew pay lookup failed:", error.code);
      throw new Error("crew_pay_failed");
    }
    const rows = data ?? [];
    for (const row of rows) {
      const wedding = one(row.weddings as unknown as { id: string; wedding_date: string; clients: ClientName | ClientName[] | null });
      if (!wedding) continue;
      const client = one(wedding.clients);
      const pay = one(row.assignment_pay as unknown as { amount_millimes: number; paid_at: string | null } | null);
      const jobs = byMember.get(row.member_id) ?? [];
      jobs.push({
        weddingId: wedding.id,
        weddingDate: wedding.wedding_date,
        couple: client ? (client.partner_two_name ? `${client.partner_one_name} & ${client.partner_two_name}` : client.partner_one_name) : unnamed,
        role: row.role_on_day,
        pay: pay?.amount_millimes ?? 0,
        paidAt: pay?.paid_at ?? null,
      });
      byMember.set(row.member_id, jobs);
    }
    offset += rows.length;
    if (!rows.length || (count != null ? offset >= count : rows.length < batchSize)) break;
  }
  for (const jobs of byMember.values()) jobs.sort((a, b) => a.weddingDate.localeCompare(b.weddingDate) || a.weddingId.localeCompare(b.weddingId));
  return byMember;
}

export async function memberJobs(
  supabase: Supabase,
  range: { start: string; end: string } | null,
  memberId: string,
  unnamed = "Wedding",
) {
  return (await crewJobs(supabase, range, memberId, unnamed)).get(memberId) ?? [];
}

export function payTotals(jobs: CrewJob[]) {
  const total = jobs.reduce((sum, job) => sum + job.pay, 0);
  const paid = jobs.filter((job) => job.paidAt).reduce((sum, job) => sum + job.pay, 0);
  return { total, paid, unpaid: total - paid };
}

export function parseMonth(value: string | undefined, fallback: string, locale: "en" | "fr" = "en") {
  const key = value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : fallback;
  const [year, month] = key.split("-").map(Number);
  const prev = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
  const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
  const label = new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
  return { key, year, month, prev, next, label };
}

export async function weddingOptions(supabase: Supabase, locale: "en" | "fr" = "en", unnamed = "Wedding") {
  const { data } = await supabase
    .from("weddings")
    .select("id, wedding_date, clients(partner_one_name, partner_two_name)")
    .gte("wedding_date", daysAgoInTunis(400))
    .neq("status", "cancelled")
    .order("wedding_date", { ascending: false });
  return (data ?? []).map((wedding) => {
    const client = Array.isArray(wedding.clients) ? wedding.clients[0] : wedding.clients;
    const name = client
      ? client.partner_two_name
        ? `${client.partner_one_name} & ${client.partner_two_name}`
        : client.partner_one_name
      : unnamed;
    return { id: wedding.id, label: `${name} · ${formatDate(wedding.wedding_date, locale)}` };
  });
}
