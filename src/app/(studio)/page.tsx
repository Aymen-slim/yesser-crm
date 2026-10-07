import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardPeriodField } from "@/components/client";
import { EarningsChart } from "@/components/chart";
import { EmptyState, Meter, Section, StatCard, StatusBadge, coupleName } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import {
  type DashboardView,
  calendarYear,
  dashboardPeriodInRange,
  formatDate,
  one,
  resolveDashboardPeriod,
  todayInTunis,
} from "@/lib/constants";
import { dateTag, fill, getMessages } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { formatTnd } from "@/lib/money";
import { type CrewJob, crewJobs, parseMonth, payTotals } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";

type ClientName = { partner_one_name: string; partner_two_name: string };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; day?: string; view?: string; period?: string }>;
}) {
  const profile = await requireUser();
  if (profile.role === "assistant") redirect("/weddings");
  const params = await searchParams;
  const locale = await getLocale();
  const messages = getMessages(locale);
  const supabase = await createClient();
  const today = todayInTunis();
  const admin = profile.role === "admin";
  const period = resolveDashboardPeriod(params.view, params.period, today, locale);
  const view = period.view;
  const yearText = String(period.year);
  const monthText = String(period.month).padStart(2, "0");
  const months = calendarYear(period.year, locale);
  const rangeStart = period.start;
  const periodEnd = period.end;
  const buckets =
    view === "year"
      ? months.map((item) => ({ key: item.key, label: item.label }))
      : view === "day"
        ? [{ key: period.key, label: String(Number(period.key.slice(8, 10))) }]
        : Array.from({ length: period.days }, (_, index) => {
            const day = index + 1;
            return { key: `${yearText}-${monthText}-${String(day).padStart(2, "0")}`, label: String(day) };
          });
  const selectedKey =
    view === "day"
      ? period.key
      : view === "year"
        ? months.some((item) => item.key === params.month)
          ? params.month
          : undefined
        : buckets.some((bucket) => bucket.key === params.day)
          ? params.day
          : undefined;
  const selectedLabel = selectedKey
    ? view === "year"
      ? parseMonth(selectedKey, selectedKey, locale).label
      : formatDate(selectedKey, locale)
    : null;
  const skip = Promise.resolve({ data: [], count: 0 });
  let openTasks = supabase
    .from("tasks")
    .select("id, title, due_date, status, wedding_id, weddings(clients(partner_one_name, partner_two_name))")
    .neq("status", "done")
    .order("due_date", { nullsFirst: false })
    .limit(8);
  if (!admin) openTasks = openTasks.eq("assignee_id", profile.id);

  const [weddings, extraDays, tasks, leads, overdue, paid, expenses, unpaid, monthWeddings, crewPaid, crew, team] = await Promise.all([
    supabase
      .from("weddings")
      .select("id, wedding_date, venue_name, city, status, clients(partner_one_name, partner_two_name)")
      .gte("wedding_date", today)
      .neq("status", "cancelled")
      .order("wedding_date")
      .limit(6),
    supabase
      .from("wedding_days")
      .select("day_date, label, wedding_id, weddings(id, wedding_date, venue_name, city, status, clients(partner_one_name, partner_two_name))")
      .gte("day_date", today)
      .order("day_date")
      .limit(12),
    openTasks,
    admin
      ? supabase.from("leads").select("id", { count: "exact", head: true }).in("status", ["new", "contacted", "quote_sent"])
      : skip,
    admin
      ? supabase.from("payments").select("id", { count: "exact", head: true }).is("paid_at", null).lt("due_date", today)
      : skip,
    admin
      ? supabase
          .from("payments")
          .select("paid_at, amount_millimes, label, wedding_id, weddings(clients(partner_one_name, partner_two_name))")
          .gte("paid_at", rangeStart)
          .lt("paid_at", periodEnd)
          .not("paid_at", "is", null)
      : skip,
    admin ? supabase.from("expenses").select("spent_on, amount_millimes, category, wedding_id").gte("spent_on", rangeStart).lt("spent_on", periodEnd) : skip,
    admin ? supabase.from("payments").select("amount_millimes").is("paid_at", null) : skip,
    supabase
      .from("weddings")
      .select("id", { count: "exact", head: true })
      .gte("wedding_date", rangeStart)
      .lt("wedding_date", periodEnd)
      .neq("status", "cancelled"),
    admin
      ? supabase.from("assignment_pay").select("paid_at, amount_millimes, member_id").gte("paid_at", rangeStart).lt("paid_at", periodEnd).not("paid_at", "is", null)
      : skip,
    admin ? crewJobs(supabase, { start: rangeStart, end: periodEnd }, undefined, messages.common.wedding) : Promise.resolve(new Map<string, CrewJob[]>()),
    admin ? supabase.from("profiles").select("id, full_name, job") : skip,
  ]);

  const upcoming: {
    key: string;
    id: string;
    date: string;
    label: string;
    venue_name: string;
    city: string;
    status: string;
    clients: ClientName | ClientName[] | null;
  }[] = (weddings.data ?? []).map((wedding) => ({
    key: `${wedding.id}-${wedding.wedding_date}`,
    id: wedding.id,
    date: wedding.wedding_date,
    label: "",
    venue_name: wedding.venue_name,
    city: wedding.city,
    status: wedding.status,
    clients: wedding.clients,
  }));
  for (const day of extraDays.data ?? []) {
    const wedding = one<{
      id: string;
      wedding_date: string;
      venue_name: string;
      city: string;
      status: string;
      clients: ClientName | ClientName[] | null;
    }>(day.weddings);
    if (!wedding || wedding.status === "cancelled" || wedding.wedding_date === day.day_date) continue;
    upcoming.push({
      key: `${wedding.id}-${day.day_date}`,
      id: wedding.id,
      date: day.day_date,
      label: day.label,
      venue_name: wedding.venue_name,
      city: wedding.city,
      status: wedding.status,
      clients: wedding.clients,
    });
  }
  upcoming.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const upcomingShown = upcoming.slice(0, 6);

  const chart = buckets.map((bucket) => {
    const earnings = (paid.data ?? [])
      .filter((row) => String(row.paid_at).startsWith(bucket.key))
      .reduce((sum, row) => sum + row.amount_millimes, 0);
    const spent = [...(expenses.data ?? []).map((row) => ({ day: row.spent_on, amount: row.amount_millimes })),
      ...(crewPaid.data ?? []).map((row) => ({ day: row.paid_at, amount: row.amount_millimes }))]
      .filter((row) => String(row.day).startsWith(bucket.key))
      .reduce((sum, row) => sum + row.amount, 0);
    return { key: bucket.key, label: bucket.label, earnings, expenses: spent, selected: bucket.key === selectedKey };
  });
  const people = new Map((team.data ?? []).map((person) => [person.id, person]));
  const crewRows = [...crew.entries()]
    .map(([memberId, jobs]) => ({ memberId, person: people.get(memberId), jobs, pay: payTotals(jobs) }))
    .sort((a, b) => b.pay.total - a.pay.total);
  const crewTotals = payTotals([...crew.values()].flat());
  const periodEarnings = chart.reduce((sum, bucket) => sum + bucket.earnings, 0);
  const periodSpent = chart.reduce((sum, bucket) => sum + bucket.expenses, 0);
  const selectedChart = chart.find((bucket) => bucket.key === selectedKey);
  const received = selectedKey
    ? (paid.data ?? [])
        .filter((row) => String(row.paid_at).startsWith(selectedKey))
        .map((row, index) => {
          const client = one<ClientName>(one<{ clients: ClientName | ClientName[] | null }>(row.weddings)?.clients);
          const name = client ? coupleName(client.partner_one_name, client.partner_two_name) : messages.common.wedding;
          return {
            key: `pay-${index}-${row.wedding_id}`,
            date: String(row.paid_at),
            label: `${name} · ${row.label}`,
            amount: row.amount_millimes,
            href: `/weddings/${row.wedding_id}`,
          };
        })
        .sort((a, b) => b.date.localeCompare(a.date) || a.label.localeCompare(b.label))
    : [];
  const spent = selectedKey
    ? [
        ...(expenses.data ?? [])
          .filter((row) => String(row.spent_on).startsWith(selectedKey))
          .map((row, index) => ({
            key: `exp-${index}-${row.wedding_id ?? "studio"}`,
            date: String(row.spent_on),
            label: row.category,
            amount: row.amount_millimes,
            href: row.wedding_id ? `/weddings/${row.wedding_id}` : "/expenses",
          })),
        ...(crewPaid.data ?? [])
          .filter((row) => String(row.paid_at).startsWith(selectedKey))
          .map((row, index) => ({
            key: `crew-${index}-${row.member_id}`,
            date: String(row.paid_at),
            label: `${people.get(row.member_id)?.full_name ?? messages.common.teamMember} · ${messages.chart.teamPay}`,
            amount: row.amount_millimes,
            href: `/team/${row.member_id}`,
          })),
      ].sort((a, b) => b.date.localeCompare(a.date) || a.label.localeCompare(b.label))
    : [];
  const outstanding = (unpaid.data ?? []).reduce((sum, row) => sum + row.amount_millimes, 0);
  const earnedLabel = fill(messages.dash.earnedIn, { period: period.label });
  const weddingsLabel = fill(messages.dash.weddingsIn, { period: period.label });
  const chartCopy = {
    ...messages.chart,
    title: period.label,
    aria: view === "year" ? messages.chart.aria : messages.chart.ariaMonth,
  };
  const periodQuery = period.isCurrent ? "" : `&period=${period.key}`;
  const viewHref = (target: DashboardView) => {
    const value =
      target === "year"
        ? String(period.year)
        : target === "month"
          ? view === "day"
            ? period.key.slice(0, 7)
            : view === "year"
              ? String(period.year) === today.slice(0, 4)
                ? today.slice(0, 7)
                : `${period.year}-01`
              : period.key
          : view === "day"
            ? period.key
            : view === "month"
              ? period.key === today.slice(0, 7)
                ? today
                : `${period.key}-01`
              : String(period.year) === today.slice(0, 4)
                ? today
                : `${period.year}-01-01`;
    const currentValue = target === "year" ? today.slice(0, 4) : target === "day" ? today : today.slice(0, 7);
    return value === currentValue ? (target === "month" ? "/?view=month" : `/?view=${target}`) : `/?view=${target}&period=${value}`;
  };
  const clearHref = view === "year" ? `/?view=year${periodQuery}` : `/?view=month${periodQuery}`;
  const calendarMonth = view === "year" ? `${period.key}-01` : view === "day" ? period.key.slice(0, 7) : period.key;
  const pickLabel = view === "year" ? messages.dash.pickYear : view === "day" ? messages.dash.pickDate : messages.dash.pickMonth;

  return (
    <div>
      <div className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-muted">{formatDate(today, locale)}</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight break-words md:text-5xl">
            {fill(messages.dash.hello, { name: profile.full_name.split(" ")[0] })}
          </h1>
          <div className="mt-5 flex flex-col gap-3">
            <div className="flex w-full rounded-full bg-track p-1 text-sm md:inline-flex md:w-fit" role="group" aria-label={messages.dash.period}>
              {(["month", "year", "day"] as const).map((item) => (
                <Link
                  key={item}
                  href={viewHref(item)}
                  prefetch={false}
                  aria-current={view === item ? "page" : undefined}
                  className={`flex min-h-11 flex-1 items-center justify-center rounded-full px-4 py-2 no-underline md:flex-none ${view === item ? "bg-ink font-medium text-white" : "text-muted hover:text-ink"}`}
                >
                  {item === "month" ? messages.dash.viewMonth : item === "year" ? messages.dash.viewYear : messages.dash.viewDay}
                </Link>
              ))}
            </div>
            <div className="flex w-full flex-wrap items-center gap-2">
              {dashboardPeriodInRange(view, period.prev) ? (
                <Link className="button ghost no-underline" href={`/?view=${view}&period=${period.prev}`} prefetch={false}>
                  ← {messages.common.previous}
                </Link>
              ) : null}
              <DashboardPeriodField view={view} value={period.key} label={pickLabel} />
              {dashboardPeriodInRange(view, period.next) ? (
                <Link className="button ghost no-underline" href={`/?view=${view}&period=${period.next}`} prefetch={false}>
                  {messages.common.next} →
                </Link>
              ) : null}
              {period.isCurrent ? null : (
                <Link className="button ghost no-underline" href={view === "month" ? "/?view=month" : `/?view=${view}`} prefetch={false}>
                  {messages.dash.today}
                </Link>
              )}
            </div>
          </div>
        </div>
        {admin ? (
          <div className="w-full shrink-0 overflow-hidden rounded-[1.75rem] bg-[linear-gradient(135deg,#76FB91_0%,#d8ffe3_58%,#ffffff_100%)] p-6 shadow-[0_16px_40px_rgba(118,251,145,0.28)] lg:max-w-sm">
            <p className="text-sm font-medium">{earnedLabel}</p>
            <p className="mt-3 font-display text-3xl font-semibold tracking-tight md:text-4xl">{formatTnd(periodEarnings)}</p>
            <p className="mt-4 text-sm">
              {weddingsLabel}
              <span className="mt-1 block text-2xl font-semibold tracking-tight">{monthWeddings.count ?? 0}</span>
            </p>
          </div>
        ) : null}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {admin ? (
          <>
            <StatCard
              label={earnedLabel}
              value={formatTnd(periodEarnings)}
              href="/payments"
              footer={
                <div className="mt-5">
                  <Meter
                    segments={[
                      { value: periodEarnings, tone: "ink" },
                      { value: periodSpent, tone: "accent" },
                    ]}
                  />
                  <p className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-ink" />
                      {messages.chart.earnings}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                      {messages.chart.expenses}
                    </span>
                  </p>
                </div>
              }
            />
            <StatCard
              label={messages.dash.unpaidInstallments}
              value={formatTnd(outstanding)}
              hint={fill(messages.dash.overdueCount, { count: overdue.count ?? 0 })}
              tone={(overdue.count ?? 0) > 0 ? "warn" : "default"}
              href="/payments"
            />
            <StatCard label={messages.dash.openLeads} value={leads.count ?? 0} href="/clients?tab=leads" />
          </>
        ) : null}
        <StatCard label={weddingsLabel} value={monthWeddings.count ?? 0} href={`/calendar?month=${calendarMonth}`} />
      </div>

      {admin && view !== "day" ? (
        <EarningsChart
          months={chart}
          copy={chartCopy}
          hrefFor={(key) => (view === "year" ? `/?view=year${periodQuery}&month=${key}` : `/?view=month${periodQuery}&day=${key}`)}
        />
      ) : null}

      {admin && selectedLabel && selectedChart ? (
        <Section
          title={selectedLabel}
          action={
            <Link href={view === "day" ? `/?view=month&period=${period.key.slice(0, 7)}` : clearHref} className="text-sm text-muted">
              {view === "year" ? messages.chart.allYear : messages.chart.allMonth}
            </Link>
          }
          className="mb-6"
        >
          <dl className="mb-5 flex flex-wrap gap-6 text-sm">
            <div>
              <dt className="text-xs text-muted">{messages.chart.earnings}</dt>
              <dd className="font-medium">{formatTnd(selectedChart.earnings)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{messages.chart.expenses}</dt>
              <dd className="font-medium">{formatTnd(selectedChart.expenses)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{messages.chart.net}</dt>
              <dd className={`font-medium ${selectedChart.earnings - selectedChart.expenses < 0 ? "text-red-700" : ""}`}>
                {formatTnd(selectedChart.earnings - selectedChart.expenses)}
              </dd>
            </div>
          </dl>
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold">{messages.chart.received}</h3>
              {received.length === 0 ? (
                <EmptyState>{view === "year" ? messages.chart.emptyReceived : messages.chart.emptyReceivedDay}</EmptyState>
              ) : (
                <MonthLines rows={received} locale={locale} />
              )}
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">{messages.chart.spentList}</h3>
              {spent.length === 0 ? (
                <EmptyState>{view === "year" ? messages.chart.emptySpent : messages.chart.emptySpentDay}</EmptyState>
              ) : (
                <MonthLines rows={spent} locale={locale} />
              )}
            </div>
          </div>
        </Section>
      ) : null}

      {admin ? (
        <Section
          title={fill(messages.dash.teamIn, { period: period.label, amount: formatTnd(crewTotals.total) })}
          action={<Link href="/team" className="text-sm text-muted">{messages.dash.openTeam}</Link>}
          className="mb-6"
        >
          {crewRows.length === 0 ? (
            <EmptyState>{fill(messages.dash.nobodyIn, { period: period.label })}</EmptyState>
          ) : (
            <ul className="-mx-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {crewRows.map(({ memberId, person, jobs, pay }) => (
                <li key={memberId}>
                  <Link href={`/team/${memberId}`} className="block rounded-2xl px-2 py-2.5 no-underline hover:bg-canvas">
                    <span className="flex items-center justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{person?.full_name ?? messages.common.teamMember}</span>
                        <span className="block truncate text-xs text-muted">
                          {person?.job ? `${person.job} · ` : ""}
                          {fill(jobs.length === 1 ? messages.common.weddingOne : messages.common.weddingMany, { count: jobs.length })}
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-sm">
                        <span className="block font-medium">{formatTnd(pay.total)}</span>
                        <span className={`block text-xs ${pay.unpaid ? "text-red-700" : "text-ink"}`}>
                          {pay.unpaid ? fill(messages.common.toPay, { amount: formatTnd(pay.unpaid) }) : messages.common.paid}
                        </span>
                      </span>
                    </span>
                    <span className="mt-2 block">
                      <Meter
                        segments={[
                          { value: pay.paid, tone: "ink" },
                          { value: pay.unpaid, tone: "accent" },
                        ]}
                      />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={messages.dash.upcoming} action={<Link href="/weddings" className="text-sm text-muted">{messages.dash.viewAll}</Link>}>
          {upcomingShown.length === 0 ? (
            <EmptyState>{messages.dash.noUpcoming}</EmptyState>
          ) : (
            <ul className="-mx-2">
              {upcomingShown.map((wedding) => {
                const client = one<ClientName>(wedding.clients);
                return (
                  <li key={wedding.key}>
                    <Link
                      href={`/weddings/${wedding.id}`}
                      className="flex items-center gap-4 rounded-lg px-2 py-2.5 no-underline hover:bg-canvas"
                    >
                      <DateTile date={wedding.date} locale={locale} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {client ? coupleName(client.partner_one_name, client.partner_two_name) : messages.common.wedding}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {[wedding.label, wedding.venue_name, wedding.city].filter(Boolean).join(", ") || messages.common.venueNotSet}
                        </span>
                      </span>
                      <StatusBadge status={wedding.status} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section title={messages.dash.openTasks}>
          {(tasks.data ?? []).length === 0 ? (
            <EmptyState>{messages.dash.noTasks}</EmptyState>
          ) : (
            <ul className="-mx-2">
              {(tasks.data ?? []).map((task) => {
                const client = one<ClientName>(one<{ clients: ClientName | ClientName[] }>(task.weddings)?.clients);
                const late = task.due_date && task.due_date < today;
                return (
                  <li key={task.id}>
                    <Link
                      href={`/weddings/${task.wedding_id}`}
                      className="flex items-center justify-between gap-4 rounded-lg px-2 py-2.5 no-underline hover:bg-canvas"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{task.title}</span>
                        <span className="block truncate text-xs text-muted">
                          {client ? coupleName(client.partner_one_name, client.partner_two_name) : messages.common.wedding}
                        </span>
                      </span>
                      <span className={`shrink-0 text-xs ${late ? "font-medium text-red-700" : "text-muted"}`}>
                        {task.due_date ? `${late ? `${messages.common.late} · ` : ""}${formatDate(task.due_date, locale)}` : messages.common.noDueDate}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

function MonthLines({
  rows,
  locale,
}: {
  rows: { key: string; date: string; label: string; amount: number; href: string }[];
  locale: "en" | "fr";
}) {
  return (
    <ul className="-mx-2">
      {rows.map((row) => (
        <li key={row.key}>
          <Link href={row.href} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 no-underline hover:bg-canvas">
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{row.label}</span>
              <span className="block text-xs text-muted">{formatDate(row.date, locale)}</span>
            </span>
            <span className="shrink-0 text-sm font-medium">{formatTnd(row.amount)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function DateTile({ date, locale }: { date: string; locale: "en" | "fr" }) {
  const [year, month, day] = date.split("-").map(Number);
  const label = new Intl.DateTimeFormat(dateTag(locale), { month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
  return (
    <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl bg-accent text-ink">
      <span className="text-[10px] leading-none font-semibold uppercase">{label}</span>
      <span className="font-display text-lg leading-none font-semibold">{day}</span>
    </span>
  );
}
