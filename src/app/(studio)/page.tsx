import Link from "next/link";
import { EarningsChart } from "@/components/chart";
import { EmptyState, PageHeader, Section, StatCard, StatusBadge, coupleName } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatDate, last12Months, monthRange, one, todayInTunis } from "@/lib/constants";
import { dateTag, fill, getMessages } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { formatTnd } from "@/lib/money";
import { type CrewJob, crewJobs, parseMonth, payTotals } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";

type ClientName = { partner_one_name: string; partner_two_name: string };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const profile = await requireUser();
  const params = await searchParams;
  const locale = await getLocale();
  const messages = getMessages(locale);
  const supabase = await createClient();
  const today = todayInTunis();
  const admin = profile.role === "admin";
  const months = last12Months(locale);
  const selectedKey = months.some((month) => month.key === params.month) ? params.month : undefined;
  const selectedMonth = selectedKey ? parseMonth(selectedKey, selectedKey, locale) : null;
  const current = months[months.length - 1];
  const thisMonth = monthRange(current.year, current.month);
  const rangeStart = `${months[0].key}-01`;
  const skip = Promise.resolve({ data: [], count: 0 });

  const [weddings, tasks, leads, overdue, paid, expenses, unpaid, monthWeddings, crewPaid, crew, team] = await Promise.all([
    supabase
      .from("weddings")
      .select("id, wedding_date, venue_name, city, status, clients(partner_one_name, partner_two_name)")
      .gte("wedding_date", today)
      .neq("status", "cancelled")
      .order("wedding_date")
      .limit(6),
    supabase
      .from("tasks")
      .select("id, title, due_date, status, wedding_id, weddings(clients(partner_one_name, partner_two_name))")
      .neq("status", "done")
      .order("due_date", { nullsFirst: false })
      .limit(8),
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
          .not("paid_at", "is", null)
      : skip,
    admin ? supabase.from("expenses").select("spent_on, amount_millimes, category, wedding_id").gte("spent_on", rangeStart) : skip,
    admin ? supabase.from("payments").select("amount_millimes").is("paid_at", null) : skip,
    supabase
      .from("weddings")
      .select("id", { count: "exact", head: true })
      .gte("wedding_date", thisMonth.start)
      .lt("wedding_date", thisMonth.end)
      .neq("status", "cancelled"),
    admin
      ? supabase.from("assignment_pay").select("paid_at, amount_millimes, member_id").gte("paid_at", rangeStart).not("paid_at", "is", null)
      : skip,
    admin ? crewJobs(supabase, thisMonth, undefined, messages.common.wedding) : Promise.resolve(new Map<string, CrewJob[]>()),
    admin ? supabase.from("profiles").select("id, full_name, job") : skip,
  ]);

  const chart = months.map((month) => {
    const earnings = (paid.data ?? [])
      .filter((row) => String(row.paid_at).startsWith(month.key))
      .reduce((sum, row) => sum + row.amount_millimes, 0);
    const spent = [...(expenses.data ?? []).map((row) => ({ day: row.spent_on, amount: row.amount_millimes })),
      ...(crewPaid.data ?? []).map((row) => ({ day: row.paid_at, amount: row.amount_millimes }))]
      .filter((row) => String(row.day).startsWith(month.key))
      .reduce((sum, row) => sum + row.amount, 0);
    return { key: month.key, label: month.label, earnings, expenses: spent, selected: month.key === selectedKey };
  });
  const people = new Map((team.data ?? []).map((person) => [person.id, person]));
  const crewRows = [...crew.entries()]
    .map(([memberId, jobs]) => ({ memberId, person: people.get(memberId), jobs, pay: payTotals(jobs) }))
    .sort((a, b) => b.pay.total - a.pay.total);
  const crewTotals = payTotals([...crew.values()].flat());
  const monthEarnings = chart[chart.length - 1].earnings;
  const selectedChart = chart.find((month) => month.key === selectedKey);
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

  return (
    <div>
      <PageHeader title={fill(messages.dash.hello, { name: profile.full_name.split(" ")[0] })} subtitle={formatDate(today, locale)} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {admin ? (
          <>
            <StatCard label={messages.dash.earnedMonth} value={formatTnd(monthEarnings)} href="/payments" />
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
        <StatCard label={messages.dash.weddingsMonth} value={monthWeddings.count ?? 0} href="/calendar" />
      </div>

      {admin ? <EarningsChart months={chart} copy={messages.chart} /> : null}

      {admin && selectedMonth && selectedChart ? (
        <Section
          title={selectedMonth.label}
          action={<Link href="/" className="text-sm text-muted">{messages.chart.all}</Link>}
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
                <EmptyState>{messages.chart.emptyReceived}</EmptyState>
              ) : (
                <MonthLines rows={received} locale={locale} />
              )}
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">{messages.chart.spentList}</h3>
              {spent.length === 0 ? (
                <EmptyState>{messages.chart.emptySpent}</EmptyState>
              ) : (
                <MonthLines rows={spent} locale={locale} />
              )}
            </div>
          </div>
        </Section>
      ) : null}

      {admin ? (
        <Section
          title={fill(messages.dash.teamMonth, { amount: formatTnd(crewTotals.total) })}
          action={<Link href="/team" className="text-sm text-muted">{messages.dash.openTeam}</Link>}
          className="mb-6"
        >
          {crewRows.length === 0 ? (
            <EmptyState>{messages.dash.nobodyAssigned}</EmptyState>
          ) : (
            <ul className="-mx-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {crewRows.map(({ memberId, person, jobs, pay }) => (
                <li key={memberId}>
                  <Link href={`/team/${memberId}`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 no-underline hover:bg-canvas">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{person?.full_name ?? messages.common.teamMember}</span>
                      <span className="block truncate text-xs text-muted">
                        {person?.job ? `${person.job} · ` : ""}
                        {fill(jobs.length === 1 ? messages.common.weddingOne : messages.common.weddingMany, { count: jobs.length })}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-sm">
                      <span className="block font-medium">{formatTnd(pay.total)}</span>
                      <span className={`block text-xs ${pay.unpaid ? "text-red-700" : "text-emerald-700"}`}>
                        {pay.unpaid ? fill(messages.common.toPay, { amount: formatTnd(pay.unpaid) }) : messages.common.paid}
                      </span>
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
          {(weddings.data ?? []).length === 0 ? (
            <EmptyState>{messages.dash.noUpcoming}</EmptyState>
          ) : (
            <ul className="-mx-2">
              {(weddings.data ?? []).map((wedding) => {
                const client = one<ClientName>(wedding.clients);
                return (
                  <li key={wedding.id}>
                    <Link
                      href={`/weddings/${wedding.id}`}
                      className="flex items-center gap-4 rounded-lg px-2 py-2.5 no-underline hover:bg-canvas"
                    >
                      <DateTile date={wedding.wedding_date} locale={locale} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {client ? coupleName(client.partner_one_name, client.partner_two_name) : messages.common.wedding}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {[wedding.venue_name, wedding.city].filter(Boolean).join(", ") || messages.common.venueNotSet}
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
    <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-accent-soft text-accent">
      <span className="text-[10px] leading-none font-semibold uppercase">{label}</span>
      <span className="font-display text-lg leading-tight">{day}</span>
    </span>
  );
}
