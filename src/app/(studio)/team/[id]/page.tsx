import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmSubmit, SubmitButton } from "@/components/client";
import {
  Badge,
  Banner,
  EmptyState,
  Field,
  InstagramLink,
  MonthNav,
  PageHeader,
  Section,
  StatCard,
} from "@/components/ui";
import { deleteMember, setCrewPaid, setMemberActive, updateMember } from "@/lib/actions";
import { requireAdmin } from "@/lib/auth";
import { formatDate, monthRange, one, todayInTunis } from "@/lib/constants";
import { fill, getMessages } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { formatTnd } from "@/lib/money";
import { crewJobs, parseMonth, payTotals } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";

export default async function TeamMemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string; month?: string }>;
}) {
  await requireAdmin();
  const locale = await getLocale();
  const messages = getMessages(locale);
  const { id } = await params;
  const query = await searchParams;
  const thisMonth = todayInTunis().slice(0, 7);
  const month = parseMonth(query.month, thisMonth, locale);
  const range = monthRange(month.year, month.month);
  const supabase = await createClient();

  const [{ data: member }, jobsByMember] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, phone, role, active, job, instagram, has_login, member_rates(rate_millimes)")
      .eq("id", id)
      .maybeSingle(),
    crewJobs(supabase, range, id, messages.common.wedding),
  ]);
  if (!member) notFound();

  const jobs = jobsByMember.get(id) ?? [];
  const pay = payTotals(jobs);
  const rate = one(member.member_rates as { rate_millimes: number } | { rate_millimes: number }[] | null)?.rate_millimes ?? 0;
  const here = `/team/${id}${month.key === thisMonth ? "" : `?month=${month.key}`}`;

  return (
    <div>
      <PageHeader
        back={{ href: "/team", label: messages.nav.team }}
        title={member.full_name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {member.job ? <span>{member.job}</span> : null}
            <InstagramLink handle={member.instagram} />
            {member.role === "admin" ? <Badge tone="violet">{messages.terms.admin}</Badge> : null}
            {member.has_login ? <Badge tone="blue">{messages.team.hasLogin}</Badge> : <Badge>{messages.team.noLogin}</Badge>}
            {member.active ? null : <Badge>{messages.team.inactive}</Badge>}
          </span>
        }
      />
      <Banner error={query.error} notice={query.notice} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-semibold tracking-tight">{month.label}</h2>
        <MonthNav path={`/team/${id}`} prev={month.prev} next={month.next} isCurrent={month.key === thisMonth} />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={messages.team.weddings} value={jobs.length} />
        <StatCard label={messages.team.earned} value={formatTnd(pay.total)} />
        <StatCard label={messages.team.paid} value={formatTnd(pay.paid)} />
        <StatCard label={messages.team.stillToPay} value={formatTnd(pay.unpaid)} tone={pay.unpaid > 0 ? "warn" : "default"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Section title={messages.team.weddingsMonth}>
          {jobs.length === 0 ? (
            <EmptyState>{fill(messages.team.notAssigned, { month: month.label })}</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {jobs.map((job) => (
                <li key={job.weddingId} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                  <span>
                    <Link href={`/weddings/${job.weddingId}`} className="font-medium">
                      {job.couple}
                    </Link>
                    <span className="block text-xs text-muted">
                      {formatDate(job.weddingDate, locale)} · {job.role}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-right">
                      <span className="block font-medium">{formatTnd(job.pay)}</span>
                      <span className={`block text-xs ${job.paidAt ? "text-ink" : "text-muted"}`}>
                        {job.paidAt ? fill(messages.common.paidOn, { date: formatDate(job.paidAt, locale) }) : messages.common.notPaid}
                      </span>
                    </span>
                    <form action={setCrewPaid}>
                      <input type="hidden" name="wedding_id" value={job.weddingId} />
                      <input type="hidden" name="member_id" value={id} />
                      <input type="hidden" name="paid" value={job.paidAt ? "false" : "true"} />
                      <input type="hidden" name="return_to" value={here} />
                      <SubmitButton className="ghost" pendingLabel="…">
                        {job.paidAt ? messages.common.undo : messages.weddings.markPaid}
                      </SubmitButton>
                    </form>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <div className="flex flex-col gap-6">
          <Section title={messages.team.details}>
            <form action={updateMember} className="grid gap-4">
              <input type="hidden" name="id" value={member.id} />
              <Field label={messages.team.name}>
                <input name="full_name" defaultValue={member.full_name} required />
              </Field>
              <Field label={messages.team.job}>
                <input name="job" defaultValue={member.job} />
              </Field>
              <Field label={messages.team.instagram}>
                <input name="instagram" defaultValue={member.instagram ? `@${member.instagram}` : ""} placeholder="@username" />
              </Field>
              <Field label={messages.team.phone}>
                <input name="phone" type="tel" defaultValue={member.phone ?? ""} />
              </Field>
              <Field label={messages.team.rate}>
                <input name="rate" inputMode="decimal" defaultValue={rate ? (rate / 1000).toFixed(3) : ""} placeholder="0.000" />
              </Field>
              <SubmitButton className="self-start" pendingLabel={messages.common.saving}>{messages.common.save}</SubmitButton>
            </form>
          </Section>

          {member.role === "admin" ? null : (
            <Section title={messages.team.account}>
              <div className="flex flex-wrap gap-2">
                <form action={setMemberActive}>
                  <input type="hidden" name="id" value={member.id} />
                  <input type="hidden" name="active" value={member.active ? "false" : "true"} />
                  <input type="hidden" name="return_to" value={`/team/${id}`} />
                  <SubmitButton className="ghost" pendingLabel="…">
                    {member.active ? messages.team.deactivate : messages.team.activate}
                  </SubmitButton>
                </form>
                {member.has_login ? null : (
                  <form action={deleteMember}>
                    <input type="hidden" name="id" value={member.id} />
                    <ConfirmSubmit message={fill(messages.team.deleteConfirm, { name: member.full_name })}>
                      {messages.common.delete}
                    </ConfirmSubmit>
                  </form>
                )}
              </div>
              <p className="mt-3 text-xs text-muted">
                {member.has_login ? messages.team.loginNote : messages.team.inactiveNote}
              </p>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
