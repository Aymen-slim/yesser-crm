import Link from "next/link";
import { MonthJump } from "@/components/client";
import { CalendarMonth, type CalendarEvent } from "@/components/calendar";
import { QuickBookForm } from "@/components/record-forms";
import { Banner, Card, PageHeader, coupleName } from "@/components/ui";
import { canManageCrm, requireUser } from "@/lib/auth";
import { formatDate, isIsoDate, monthRange, one, todayInTunis } from "@/lib/constants";
import { dateTag, fill, getMessages } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  return { title: getMessages(await getLocale()).nav.calendar };
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; add?: string; error?: string; notice?: string }>;
}) {
  const profile = await requireUser();
  const locale = await getLocale();
  const messages = getMessages(locale);
  const manager = canManageCrm(profile);
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(dateTag(locale), { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, index + 1))),
  );
  const { month, add, error, notice } = await searchParams;
  const addDate = manager && add && isIsoDate(add) ? add : null;
  const today = todayInTunis();
  const thisMonth = today.slice(0, 7);
  const [yearText, monthText] = (
    month && /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month) ? month : addDate ? addDate.slice(0, 7) : thisMonth
  ).split("-");
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  const { start, end, days } = monthRange(year, monthNumber);
  const prev = monthNumber === 1 ? `${year - 1}-12` : `${year}-${String(monthNumber - 1).padStart(2, "0")}`;
  const next = monthNumber === 12 ? `${year + 1}-01` : `${year}-${String(monthNumber + 1).padStart(2, "0")}`;

  const supabase = await createClient();
  let query = supabase
    .from("weddings")
    .select("id, wedding_date, start_time, venue_name, clients(partner_one_name, partner_two_name)")
    .gte("wedding_date", start)
    .lt("wedding_date", end)
    .neq("status", "cancelled")
    .order("start_time", { nullsFirst: false });
  if (!manager) {
    const { data: assigned } = await supabase.from("wedding_assignments").select("wedding_id").eq("member_id", profile.id);
    const ids = (assigned ?? []).map((row) => row.wedding_id);
    query = query.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  }
  let extraQuery = supabase
    .from("wedding_days")
    .select("wedding_id, day_date, start_time, label, weddings(status, venue_name, clients(partner_one_name, partner_two_name))")
    .gte("day_date", start)
    .lt("day_date", end);
  if (!manager) {
    const { data: assigned } = await supabase.from("wedding_assignments").select("wedding_id").eq("member_id", profile.id);
    const ids = (assigned ?? []).map((row) => row.wedding_id);
    extraQuery = extraQuery.in("wedding_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  }
  const [{ data }, { data: extraDays }] = await Promise.all([query, extraQuery]);
  const byDay = new Map<number, CalendarEvent[]>();
  const monthIds = new Set<string>();
  function addToDay(date: string, item: CalendarEvent) {
    const day = Number(String(date).slice(8, 10));
    const list = byDay.get(day) ?? [];
    if (list.some((existing) => existing.id === item.id)) return;
    list.push(item);
    byDay.set(day, list);
    monthIds.add(item.id);
  }
  for (const wedding of data ?? []) {
    const client = one(wedding.clients);
    addToDay(String(wedding.wedding_date), {
      id: wedding.id,
      name: client ? coupleName(client.partner_one_name, client.partner_two_name) : wedding.venue_name || messages.common.wedding,
      time: wedding.start_time ? wedding.start_time.slice(0, 5) : null,
      venue: wedding.venue_name || "",
    });
  }
  for (const extra of extraDays ?? []) {
    const wedding = one(extra.weddings);
    if (!wedding || wedding.status === "cancelled") continue;
    const client = one(wedding.clients);
    const name = client ? coupleName(client.partner_one_name, client.partner_two_name) : wedding.venue_name || messages.common.wedding;
    addToDay(String(extra.day_date), {
      id: extra.wedding_id,
      name: extra.label ? `${name} · ${extra.label}` : name,
      time: extra.start_time ? extra.start_time.slice(0, 5) : null,
      venue: wedding.venue_name || "",
    });
  }
  for (const items of byDay.values()) items.sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99"));
  const leadingBlanks = (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7;
  const todayDay = today.slice(0, 7) === `${yearText}-${monthText}` ? Number(today.slice(8, 10)) : null;
  const title = new Intl.DateTimeFormat(dateTag(locale), { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, monthNumber - 1, 1)),
  );

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={fill(messages.calendar.subtitle, {
          count: fill(monthIds.size === 1 ? messages.common.weddingOne : messages.common.weddingMany, { count: monthIds.size }),
        })}
      />
      <nav aria-label={messages.calendar.jump} className="mb-5 flex flex-wrap items-center gap-2">
        <div className="grid w-full min-w-0 grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2 sm:w-auto sm:max-w-sm sm:flex-1">
          <Link className="button ghost min-h-11 px-0 no-underline" href={`/calendar?month=${prev}`} prefetch={false} aria-label={messages.common.previous}>←</Link>
          <MonthJump month={`${yearText}-${monthText}`} add={addDate} label={messages.calendar.jump} />
          <Link className="button ghost min-h-11 px-0 no-underline" href={`/calendar?month=${next}`} prefetch={false} aria-label={messages.common.next}>→</Link>
        </div>
        <Link className="button ghost min-h-11 no-underline" href="/calendar" prefetch={false}>{messages.common.today}</Link>
      </nav>
      <Banner error={error} notice={notice} />
      {addDate ? (
        <div id="quick-booking" className="scroll-mt-24">
          <Card className="mb-6 p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">{fill(messages.calendar.quick, { date: formatDate(addDate, locale) })}</h2>
              <Link href={`/calendar?month=${yearText}-${monthText}`} className="text-sm text-muted">
                {messages.common.cancel}
              </Link>
            </div>
            {addDate.slice(0, 7) === `${yearText}-${monthText}` && (byDay.get(Number(addDate.slice(8, 10))) ?? []).length > 0 ? (
              <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {fill(messages.calendar.already, { names: (byDay.get(Number(addDate.slice(8, 10))) ?? []).map((item) => item.name).join(", ") })}
              </p>
            ) : null}
            <QuickBookForm date={addDate} />
            <p className="mt-3 text-xs text-muted">{messages.calendar.hint}</p>
          </Card>
        </div>
      ) : manager ? (
        <p className="mb-4 text-sm text-muted">{messages.calendar.tip}</p>
      ) : null}
      <CalendarMonth
        key={`${yearText}-${monthText}:${addDate ?? ""}:${notice ?? ""}`}
        month={`${yearText}-${monthText}`}
        days={days}
        leadingBlanks={leadingBlanks}
        todayDay={todayDay}
        addDate={addDate}
        weekdays={weekdays}
        events={Object.fromEntries(byDay)}
        admin={manager}
        locale={locale}
        labels={messages.calendar}
      />
    </div>
  );
}
