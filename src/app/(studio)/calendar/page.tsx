import Link from "next/link";
import { MonthJump } from "@/components/client";
import { QuickBookForm } from "@/components/record-forms";
import { Banner, Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatDate, monthRange, one, todayInTunis } from "@/lib/constants";
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
  const admin = profile.role === "admin";
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(dateTag(locale), { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, index + 1))),
  );
  const { month, add, error, notice } = await searchParams;
  const addDate = admin && add && /^\d{4}-\d{2}-\d{2}$/.test(add) ? add : null;
  const today = todayInTunis();
  const thisMonth = today.slice(0, 7);
  const [yearText, monthText] = (
    month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : addDate ? addDate.slice(0, 7) : thisMonth
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
  if (!admin) {
    const { data: assigned } = await supabase.from("wedding_assignments").select("wedding_id").eq("member_id", profile.id);
    const ids = (assigned ?? []).map((row) => row.wedding_id);
    query = query.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  }
  let extraQuery = supabase
    .from("wedding_days")
    .select("wedding_id, day_date, start_time, label, weddings(status, venue_name, clients(partner_one_name, partner_two_name))")
    .gte("day_date", start)
    .lt("day_date", end);
  if (!admin) {
    const { data: assigned } = await supabase.from("wedding_assignments").select("wedding_id").eq("member_id", profile.id);
    const ids = (assigned ?? []).map((row) => row.wedding_id);
    extraQuery = extraQuery.in("wedding_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  }
  const [{ data }, { data: extraDays }] = await Promise.all([query, extraQuery]);
  const byDay = new Map<number, { id: string; name: string; time: string | null }[]>();
  const monthIds = new Set<string>();
  function addToDay(date: string, item: { id: string; name: string; time: string | null }) {
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
      name: client ? client.partner_one_name : wedding.venue_name || messages.common.wedding,
      time: wedding.start_time ? wedding.start_time.slice(0, 5) : null,
    });
  }
  for (const extra of extraDays ?? []) {
    const wedding = one(extra.weddings);
    if (!wedding || wedding.status === "cancelled") continue;
    const client = one(wedding.clients);
    const name = client ? client.partner_one_name : wedding.venue_name || messages.common.wedding;
    addToDay(String(extra.day_date), {
      id: extra.wedding_id,
      name: extra.label ? `${name} · ${extra.label}` : name,
      time: extra.start_time ? extra.start_time.slice(0, 5) : null,
    });
  }
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
        action={
          <div className="flex flex-wrap items-center gap-2">
            <MonthJump month={`${yearText}-${monthText}`} add={addDate} label={messages.calendar.jump} />
            <Link className="button ghost no-underline" href={`/calendar?month=${prev}${addDate && addDate.startsWith(`${prev}-`) ? `&add=${addDate}` : ""}`}>
              ← {messages.common.previous}
            </Link>
            {`${yearText}-${monthText}` !== thisMonth ? (
              <Link className="button ghost no-underline" href="/calendar">
                {messages.common.today}
              </Link>
            ) : null}
            <Link className="button ghost no-underline" href={`/calendar?month=${next}${addDate && addDate.startsWith(`${next}-`) ? `&add=${addDate}` : ""}`}>
              {messages.common.next} →
            </Link>
          </div>
        }
      />
      <Banner error={error} notice={notice} />
      {addDate ? (
        <Card className="mb-6 p-5">
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
      ) : admin ? (
        <p className="mb-4 text-sm text-muted">{messages.calendar.tip}</p>
      ) : null}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <div className="grid min-w-[640px] grid-cols-7 gap-px bg-line text-sm">
            {weekdays.map((day) => (
              <div key={day} className="bg-canvas px-3 py-2 text-xs font-medium tracking-wide text-muted uppercase">
                {day}
              </div>
            ))}
            {Array.from({ length: leadingBlanks }, (_, index) => (
              <div key={`empty-${index}`} className="min-h-28 bg-canvas/60" />
            ))}
            {Array.from({ length: days }, (_, index) => {
              const day = index + 1;
              const items = byDay.get(day) ?? [];
              const isToday = day === todayDay;
              const iso = `${yearText}-${monthText}-${String(day).padStart(2, "0")}`;
              return (
                <div key={day} className={`group min-h-28 p-2 ${iso === addDate ? "bg-accent-soft/60" : "bg-surface"}`}>
                  <div className="flex items-center justify-between">
                    <span>
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                          isToday ? "bg-ink font-semibold text-white" : "text-muted"
                        }`}
                      >
                        {day}
                      </span>
                      {items.length > 1 ? <span className="ml-1 text-[10px] font-medium text-red-700">{messages.calendar.doubleBooked}</span> : null}
                    </span>
                    {admin ? (
                      <Link
                        href={`/calendar?month=${yearText}-${monthText}&add=${iso}`}
                        aria-label={`${messages.calendar.addDay} ${formatDate(iso, locale)}`}
                        className="flex h-6 w-6 items-center justify-center rounded-full text-muted no-underline opacity-40 group-hover:bg-canvas group-hover:opacity-100 hover:text-ink"
                      >
                        +
                      </Link>
                    ) : null}
                  </div>
                  {items.map((item) => (
                    <Link
                      key={item.id}
                      href={`/weddings/${item.id}`}
                      className="mt-1 block truncate rounded-lg bg-accent-soft px-2 py-1 text-xs text-ink no-underline hover:bg-accent"
                    >
                      {item.time ? <span className="font-semibold">{item.time} </span> : null}
                      {item.name}
                    </Link>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    </div>
  );
}
