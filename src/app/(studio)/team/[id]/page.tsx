import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmSubmit, SubmitButton } from "@/components/client";
import {
  Badge,
  Banner,
  EmptyState,
  Field,
  FilterTabs,
  InstagramLink,
  MonthNav,
  PageHeader,
  Section,
  StatCard,
} from "@/components/ui";
import { deleteMember, grantMemberLogin, setCrewPaid, setMemberActive, updateMember, updateMemberLogin, updateMemberRole } from "@/lib/actions";
import { requireManager } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate, monthRange, one, todayInTunis } from "@/lib/constants";
import { fill, getMessages } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { formatTnd } from "@/lib/money";
import { memberJobs, parseMonth, payTotals } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";

export default async function TeamMemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string; month?: string; view?: string }>;
}) {
  const profile = await requireManager();
  const admin = profile.role === "admin";
  const locale = await getLocale();
  const messages = getMessages(locale);
  const { id } = await params;
  const query = await searchParams;
  const thisMonth = todayInTunis().slice(0, 7);
  const month = parseMonth(query.month, thisMonth, locale);
  const monthly = query.view === "month" || (query.view !== "all" && Boolean(query.month));
  const range = monthly ? monthRange(month.year, month.month) : null;
  const supabase = await createClient();

  const [{ data: member, error: memberError }, jobs] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, phone, role, active, job, instagram, has_login, member_rates(rate_millimes)")
      .eq("id", id)
      .maybeSingle(),
    memberJobs(supabase, range, id, messages.common.wedding),
  ]);
  if (memberError) {
    console.error("Team member lookup failed:", memberError.code);
    throw new Error("team_failed");
  }
  if (!member) notFound();

  let loginEmail = "";
  if (admin && member.has_login) {
    const admin = createAdminClient();
    const { data } = await admin.auth.admin.getUserById(member.id);
    loginEmail = data.user?.email ?? "";
  }
  const isSelf = profile.id === member.id;
  const pay = payTotals(jobs);
  const rate = one(member.member_rates as { rate_millimes: number } | { rate_millimes: number }[] | null)?.rate_millimes ?? 0;
  const monthQuery = monthly ? `?month=${month.key}` : "";
  const here = `/team/${id}${monthQuery}`;

  return (
    <div>
      <PageHeader
        back={{ href: `/team${monthQuery}`, label: messages.nav.team }}
        title={member.full_name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {member.job ? <span>{member.job}</span> : null}
            <InstagramLink handle={member.instagram} />
            {member.role === "admin" ? <Badge tone="violet">{messages.terms.admin}</Badge> : member.role === "assistant" ? <Badge tone="blue">{messages.terms.assistant}</Badge> : null}
            {member.has_login ? <Badge tone="blue">{messages.team.hasLogin}</Badge> : <Badge>{messages.team.noLogin}</Badge>}
            {member.active ? null : <Badge>{messages.team.inactive}</Badge>}
          </span>
        }
      />
      <Banner error={query.error} notice={query.notice} />

      <FilterTabs
        active={monthly ? "month" : "all"}
        items={[
          { value: "all", label: messages.team.allWeddings, href: `/team/${id}` },
          { value: "month", label: messages.team.monthly, href: `/team/${id}?month=${month.key}` },
        ]}
      />
      <p className="mb-5 text-sm text-muted">{messages.team.payScopeHint}</p>
      {monthly ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold tracking-tight">{month.label}</h2>
          <MonthNav path={`/team/${id}`} currentHref={`/team/${id}?view=month`} prev={month.prev} next={month.next} isCurrent={month.key === thisMonth} />
        </div>
      ) : null}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={messages.team.weddings} value={jobs.length} />
        <StatCard label={messages.team.earned} value={formatTnd(pay.total)} />
        <StatCard label={messages.team.paid} value={formatTnd(pay.paid)} />
        <StatCard label={messages.team.stillToPay} value={formatTnd(pay.unpaid)} tone={pay.unpaid > 0 ? "warn" : "default"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Section title={monthly ? fill(messages.team.weddingsMonth, { month: month.label }) : messages.team.allWeddings}>
          {jobs.length === 0 ? (
            <EmptyState>{monthly ? fill(messages.team.notAssigned, { month: month.label }) : messages.team.notAssignedAll}</EmptyState>
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
            <form action={updateMember}>
              <fieldset disabled={!admin} className="grid gap-4">
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
                {admin ? <SubmitButton className="self-start" pendingLabel={messages.common.saving}>{messages.common.save}</SubmitButton> : null}
              </fieldset>
            </form>
          </Section>

          {admin ? <Section title={messages.team.account}>
            {!isSelf && member.role !== "admin" ? (
              <form action={updateMemberRole} className="mb-4 grid gap-4 border-b border-line pb-4">
                <input type="hidden" name="id" value={member.id} />
                <Field label={messages.team.userRole}>
                  <select name="role" defaultValue={member.role}>
                    <option value="member">{messages.terms.member}</option>
                    <option value="assistant">{messages.terms.assistant}</option>
                  </select>
                  <span className="text-xs text-muted">{messages.team.roleHint}</span>
                </Field>
                <SubmitButton className="self-start" pendingLabel={messages.common.saving}>{messages.common.save}</SubmitButton>
              </form>
            ) : null}
            {loginEmail ? (
              <form action={updateMemberLogin} autoComplete="off" className="grid gap-4">
                <input type="hidden" name="id" value={member.id} />
                <Field label={messages.team.email}>
                  <input name="email" type="email" defaultValue={loginEmail} required autoComplete="off" />
                </Field>
                <Field label={messages.team.newPassword}>
                  <input name="password" type="password" autoComplete="new-password" placeholder={messages.team.passwordKeep} />
                </Field>
                <SubmitButton className="self-start" pendingLabel={messages.common.saving}>
                  {messages.team.saveLogin}
                </SubmitButton>
              </form>
            ) : (
              <form action={grantMemberLogin} autoComplete="off" className="grid gap-4">
                <input type="hidden" name="id" value={member.id} />
                <p className="text-xs text-muted">{messages.team.createLoginHint}</p>
                <Field label={messages.team.email}>
                  <input name="email" type="email" required autoComplete="off" />
                </Field>
                <Field label={messages.team.password}>
                  <input name="password" type="password" required minLength={8} autoComplete="new-password" />
                </Field>
                <SubmitButton className="self-start" pendingLabel={messages.common.saving}>
                  {messages.team.createLogin}
                </SubmitButton>
              </form>
            )}
            {isSelf ? null : (
              <div className="mt-4 border-t border-line pt-4">
                <div className="flex flex-wrap gap-2">
                  <form action={setMemberActive}>
                    <input type="hidden" name="id" value={member.id} />
                    <input type="hidden" name="active" value={member.active ? "false" : "true"} />
                    <input type="hidden" name="return_to" value={`/team/${id}`} />
                    <SubmitButton className="ghost" pendingLabel="…">
                      {member.active ? messages.team.deactivate : messages.team.activate}
                    </SubmitButton>
                  </form>
                  <form action={deleteMember}>
                    <input type="hidden" name="id" value={member.id} />
                    <ConfirmSubmit message={fill(messages.team.deleteConfirm, { name: member.full_name })}>
                      {messages.common.delete}
                    </ConfirmSubmit>
                  </form>
                </div>
                <p className="mt-3 text-xs text-muted">
                  {member.has_login ? messages.team.loginNote : messages.team.inactiveNote}
                </p>
              </div>
            )}
          </Section> : null}
        </div>
      </div>
    </div>
  );
}
