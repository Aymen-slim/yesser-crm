import Link from "next/link";
import { SubmitButton } from "@/components/client";
import {
  Badge,
  Banner,
  Disclosure,
  EmptyRow,
  Field,
  InstagramLink,
  MonthNav,
  PageHeader,
  StatCard,
  TableCard,
} from "@/components/ui";
import { createMember } from "@/lib/actions";
import { requireAdmin } from "@/lib/auth";
import { monthRange, one, todayInTunis } from "@/lib/constants";
import { fill, getMessages } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { formatTnd } from "@/lib/money";
import { crewJobs, parseMonth, payTotals } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  return { title: getMessages(await getLocale()).nav.team };
}

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; month?: string }>;
}) {
  await requireAdmin();
  const locale = await getLocale();
  const messages = getMessages(locale);
  const params = await searchParams;
  const thisMonth = todayInTunis().slice(0, 7);
  const month = parseMonth(params.month, thisMonth, locale);
  const range = monthRange(month.year, month.month);
  const supabase = await createClient();
  const [{ data }, jobs] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, phone, role, active, job, instagram, has_login, member_rates(rate_millimes)")
      .order("active", { ascending: false })
      .order("full_name"),
    crewJobs(supabase, range, undefined, messages.common.wedding),
  ]);

  const allJobs = [...jobs.values()].flat();
  const totals = payTotals(allJobs);
  const monthQuery = month.key === thisMonth ? "" : `?month=${month.key}`;

  return (
    <div>
      <PageHeader
        title={messages.team.title}
        subtitle={fill(messages.team.subtitle, { month: month.label })}
        action={<MonthNav path="/team" prev={month.prev} next={month.next} isCurrent={month.key === thisMonth} />}
      />
      <Banner error={params.error} notice={params.notice} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={messages.team.payMonth} value={formatTnd(totals.total)} />
        <StatCard label={messages.team.alreadyPaid} value={formatTnd(totals.paid)} />
        <StatCard label={messages.team.stillToPay} value={formatTnd(totals.unpaid)} tone={totals.unpaid > 0 ? "warn" : "default"} />
        <StatCard label={messages.team.peopleWorking} value={jobs.size} hint={fill(messages.team.assignments, { count: allJobs.length })} />
      </div>

      <Disclosure label={messages.team.addMember} open={Boolean(params.error)}>
        <form action={createMember} autoComplete="off" className="grid gap-4 pb-5 md:grid-cols-2">
          <Field label={messages.team.name}>
            <input name="full_name" required />
          </Field>
          <Field label={messages.team.job}>
            <input name="job" placeholder={messages.team.jobHint} list="jobs" />
          </Field>
          <Field label={messages.team.instagram}>
            <input name="instagram" placeholder="@username" />
          </Field>
          <Field label={messages.team.phone}>
            <input name="phone" type="tel" placeholder="+216 20123456" />
          </Field>
          <Field label={messages.team.rate}>
            <input name="rate" inputMode="decimal" placeholder="0.000" />
          </Field>
          <fieldset className="grid gap-4 rounded-lg border border-line p-4 md:col-span-2 md:grid-cols-2">
            <legend className="px-1 text-sm font-medium text-muted">{messages.team.login}</legend>
            <p className="text-xs text-muted md:col-span-2">{messages.team.loginHint}</p>
            <Field label={messages.team.email}>
              <input name="email" type="email" autoComplete="off" />
            </Field>
            <Field label={messages.team.password}>
              <input name="password" type="password" autoComplete="new-password" />
            </Field>
          </fieldset>
          <div className="md:col-span-2">
            <SubmitButton pendingLabel={messages.common.adding}>{messages.team.add}</SubmitButton>
          </div>
          <datalist id="jobs">
            <option value="Photographer" />
            <option value="Videographer" />
            <option value="Assistant" />
            <option value="Editor" />
            <option value="Drone pilot" />
          </datalist>
        </form>
      </Disclosure>

      <TableCard>
        <table>
          <thead>
            <tr>
              <th>{messages.team.name}</th>
              <th>{messages.team.job}</th>
              <th>{messages.team.instagram}</th>
              <th>{messages.team.rate}</th>
              <th>{messages.team.weddings}</th>
              <th>{messages.team.payThisMonth}</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((member) => {
              const memberJobs = jobs.get(member.id) ?? [];
              const pay = payTotals(memberJobs);
              const rate = one(member.member_rates as { rate_millimes: number } | { rate_millimes: number }[] | null)?.rate_millimes ?? 0;
              return (
                <tr key={member.id} className={member.active ? "" : "opacity-60"}>
                  <td>
                    <Link href={`/team/${member.id}${monthQuery}`} className="font-medium">
                      {member.full_name}
                    </Link>
                    <span className="mt-0.5 flex flex-wrap gap-1">
                      {member.role === "admin" ? <Badge tone="violet">{messages.terms.admin}</Badge> : null}
                      {member.has_login ? null : <Badge>{messages.team.noLogin}</Badge>}
                      {member.active ? null : <Badge>{messages.team.inactive}</Badge>}
                    </span>
                  </td>
                  <td>{member.job || <span className="text-muted">—</span>}</td>
                  <td>
                    <InstagramLink handle={member.instagram} />
                  </td>
                  <td className="whitespace-nowrap">{rate ? formatTnd(rate) : <span className="text-muted">—</span>}</td>
                  <td>{memberJobs.length || <span className="text-muted">0</span>}</td>
                  <td className="whitespace-nowrap">
                    {pay.total ? (
                      <>
                        <span className="font-medium">{formatTnd(pay.total)}</span>
                        <span className={`block text-xs ${pay.unpaid ? "text-red-700" : "text-ink"}`}>
                          {pay.unpaid ? fill(messages.common.toPay, { amount: formatTnd(pay.unpaid) }) : messages.common.allPaid}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {(data ?? []).length === 0 ? <EmptyRow colSpan={6}>{messages.team.empty}</EmptyRow> : null}
          </tbody>
        </table>
      </TableCard>
    </div>
  );
}
