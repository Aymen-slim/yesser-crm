import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmSubmit, SubmitButton } from "@/components/client";
import {
  AssignForm,
  FileForm,
  MarkPaidForm,
  NoteForm,
  PaymentForm,
  TaskForm,
  TaskStatusForm,
  WeddingForm,
} from "@/components/record-forms";
import { Badge, Banner, Card, Disclosure, EmptyState, PageHeader, Section, StatusBadge, coupleName } from "@/components/ui";
import { deleteTask, deleteWeddingFile, setCrewPaid, unassignMember } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { formatDate, one, todayInTunis } from "@/lib/constants";
import { fill, getMessages } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { formatTnd } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export default async function WeddingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const profile = await requireUser();
  const locale = await getLocale();
  const messages = getMessages(locale);
  const { id } = await params;
  const { error, notice } = await searchParams;
  const admin = profile.role === "admin";
  const today = todayInTunis();
  const supabase = await createClient();

  const { data: wedding } = await supabase
    .from("weddings")
    .select("*, clients(id, partner_one_name, partner_two_name, phone), packages(name)")
    .eq("id", id)
    .maybeSingle();
  if (!wedding) notFound();

  const skip = Promise.resolve({ data: [] });
  const [sameDay, tasks, notes, assignments, files, payments, clients, packages, members] = await Promise.all([
    supabase.from("weddings").select("id").eq("wedding_date", wedding.wedding_date).neq("id", id).neq("status", "cancelled"),
    supabase.from("tasks").select("id, wedding_id, title, due_date, status, assignee_id").eq("wedding_id", id).order("created_at"),
    supabase.from("notes").select("id, body, created_at, profiles(full_name)").eq("wedding_id", id).order("created_at", { ascending: false }),
    supabase
      .from("wedding_assignments")
      .select("member_id, role_on_day, profiles(full_name, job), assignment_pay(amount_millimes, paid_at)")
      .eq("wedding_id", id),
    supabase.from("files").select("id, file_name, storage_path, created_at").eq("wedding_id", id).order("created_at", { ascending: false }),
    admin
      ? supabase.from("payments").select("id, label, amount_millimes, due_date, paid_at, method").eq("wedding_id", id).order("due_date", { nullsFirst: false })
      : skip,
    admin ? supabase.from("clients").select("id, partner_one_name, partner_two_name").order("partner_one_name") : skip,
    admin ? supabase.from("packages").select("id, name").order("name") : skip,
    supabase.from("profiles").select("id, full_name").eq("active", true).order("full_name"),
  ]);

  const signed = await Promise.all(
    (files.data ?? []).map(async (file) => {
      const { data } = await supabase.storage.from("studio-files").createSignedUrl(file.storage_path, 60 * 10);
      return { ...file, url: data?.signedUrl };
    }),
  );

  const client = one(wedding.clients);
  const pack = one(wedding.packages);
  const memberNames = new Map((members.data ?? []).map((member) => [member.id, member.full_name]));
  const paidTotal = (payments.data ?? []).filter((p) => p.paid_at).reduce((sum, p) => sum + p.amount_millimes, 0);
  const remaining = wedding.total_millimes - paidTotal;
  const openTasks = (tasks.data ?? []).filter((task) => task.status !== "done").length;
  const place = [wedding.venue_name, wedding.city, wedding.governorate].filter(Boolean).join(", ");
  const backPath = `/weddings/${id}`;

  return (
    <div>
      <PageHeader
        back={{ href: "/weddings", label: messages.nav.weddings }}
        title={client ? coupleName(client.partner_one_name, client.partner_two_name) : messages.common.wedding}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={wedding.status} />
            {pack ? <span>{pack.name}</span> : null}
          </span>
        }
      />
      <Banner error={error} notice={notice} />
      {(sameDay.data ?? []).length > 0 ? (
        <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {messages.weddings.sameDay}
        </p>
      ) : null}

      <Card className="mb-6 grid gap-px overflow-hidden bg-line sm:grid-cols-2 lg:grid-cols-4">
        <Fact label={messages.weddings.date}>
          {formatDate(wedding.wedding_date, locale)}
          {wedding.start_time ? <span className="text-muted"> · {wedding.start_time.slice(0, 5)}</span> : null}
        </Fact>
        <Fact label={messages.weddings.place}>{place || messages.common.notSet}</Fact>
        <Fact label={messages.weddings.couple}>
          {client ? (
            <>
              {admin ? <Link href={`/clients/${client.id}`}>{client.phone}</Link> : client.phone}
            </>
          ) : (
            "—"
          )}
        </Fact>
        {admin ? (
          <Fact label={messages.weddings.balance}>
            <span className={remaining > 0 ? "" : "text-emerald-700"}>
              {remaining > 0 ? fill(messages.common.left, { amount: formatTnd(remaining) }) : messages.common.fullyPaid}
            </span>
            <span className="block text-xs text-muted">
              {fill(messages.common.ofTotal, { paid: formatTnd(paidTotal), total: formatTnd(wedding.total_millimes) })}
            </span>
          </Fact>
        ) : (
          <Fact label={messages.weddings.openTasks}>{openTasks}</Fact>
        )}
      </Card>

      {admin ? (
        <Disclosure label={messages.weddings.edit}>
          <WeddingForm wedding={wedding} clients={clients.data ?? []} packages={packages.data ?? []} />
        </Disclosure>
      ) : null}

      {wedding.day_plan ? (
        <Section title={messages.weddings.dayPlan} className="mb-6">
          <p className="text-sm whitespace-pre-wrap">{wedding.day_plan}</p>
        </Section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Section title={messages.weddings.tasks} action={<span className="text-xs text-muted">{fill(messages.weddings.openCount, { count: openTasks })}</span>}>
            {(tasks.data ?? []).length === 0 ? (
              <EmptyState>{messages.weddings.noTasks}</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {(tasks.data ?? []).map((task) => {
                  const late = task.status !== "done" && task.due_date && task.due_date < today;
                  return (
                    <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                      <span className="min-w-0">
                        <span className={`flex items-center gap-2 font-medium ${task.status === "done" ? "text-muted line-through" : ""}`}>
                          {task.title}
                          <StatusBadge status={task.status} />
                        </span>
                        <span className={`block text-xs ${late ? "text-red-700" : "text-muted"}`}>
                          {task.due_date
                            ? `${late ? `${messages.common.late} · ` : ""}${formatDate(task.due_date, locale)}`
                            : messages.common.noDueDate}
                          {task.assignee_id ? ` · ${memberNames.get(task.assignee_id) ?? messages.common.formerMember}` : ""}
                        </span>
                      </span>
                      <span className="flex items-center gap-1">
                        <TaskStatusForm task={task} />
                        {admin ? (
                          <form action={deleteTask}>
                            <input type="hidden" name="id" value={task.id} />
                            <input type="hidden" name="wedding_id" value={id} />
                            <ConfirmSubmit message={fill(messages.weddings.deleteTask, { title: task.title })}>{messages.common.delete}</ConfirmSubmit>
                          </form>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <TaskForm weddingId={id} members={members.data ?? []} />
          </Section>

          {admin ? (
            <Section
              title={messages.weddings.payments}
              action={
                <Link href={`/invoices/new?wedding=${id}`} className="text-sm text-muted">
                  {messages.invoice.make}
                </Link>
              }
            >
              {(payments.data ?? []).length === 0 ? (
                <EmptyState>{messages.weddings.noPayments}</EmptyState>
              ) : (
                <ul className="divide-y divide-line">
                  {(payments.data ?? []).map((payment) => {
                    const overdue = !payment.paid_at && payment.due_date && payment.due_date < today;
                    return (
                      <li key={payment.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                        <span>
                          <span className="flex items-center gap-2 font-medium">
                            {payment.label}
                            <StatusBadge status={payment.paid_at ? "paid" : overdue ? "overdue" : "due"} />
                          </span>
                          <span className="block text-xs text-muted">
                            {formatTnd(payment.amount_millimes)} ·{" "}
                            {payment.paid_at
                              ? fill(messages.common.paidOn, { date: formatDate(payment.paid_at, locale) })
                              : fill(messages.common.dueOn, { date: formatDate(payment.due_date, locale) })}
                          </span>
                        </span>
                        {payment.paid_at ? null : <MarkPaidForm paymentId={payment.id} returnTo={backPath} />}
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="mt-4 border-t border-line pt-4">
                <Disclosure label={messages.weddings.recordPayment}>
                  <PaymentForm weddingId={id} returnTo={backPath} />
                </Disclosure>
              </div>
            </Section>
          ) : null}

          <Section title={messages.weddings.notes}>
            {(notes.data ?? []).length === 0 ? (
              <EmptyState>{messages.weddings.noNotes}</EmptyState>
            ) : (
              <ul className="flex flex-col gap-3">
                {(notes.data ?? []).map((note) => (
                  <li key={note.id} className="rounded-lg bg-canvas px-3 py-2.5 text-sm">
                    <p className="whitespace-pre-wrap">{note.body}</p>
                    <span className="mt-1 block text-xs text-muted">
                      {one(note.profiles)?.full_name ?? messages.common.someone} · {formatDate(note.created_at.slice(0, 10), locale)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <NoteForm weddingId={id} />
          </Section>
        </div>

        <div className="flex flex-col gap-6">
          <Section title={messages.weddings.team}>
            {(assignments.data ?? []).length === 0 ? (
              <EmptyState>{messages.weddings.nobody}</EmptyState>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {(assignments.data ?? []).map((row) => {
                  const pay = one(row.assignment_pay as { amount_millimes: number; paid_at: string | null } | { amount_millimes: number; paid_at: string | null }[] | null);
                  return (
                    <li key={row.member_id} className="py-2.5 first:pt-0">
                      <div className="flex items-center justify-between gap-2">
                        {admin ? (
                          <Link href={`/team/${row.member_id}`} className="font-medium">
                            {one(row.profiles)?.full_name}
                          </Link>
                        ) : (
                          <span className="font-medium">{one(row.profiles)?.full_name}</span>
                        )}
                        <Badge>{row.role_on_day}</Badge>
                      </div>
                      {admin ? (
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <span className={`text-xs ${pay?.paid_at ? "text-emerald-700" : "text-muted"}`}>
                            {formatTnd(pay?.amount_millimes ?? 0)} · {pay?.paid_at ? messages.common.paid : messages.common.notPaid}
                          </span>
                          <span className="flex items-center">
                            <form action={setCrewPaid}>
                              <input type="hidden" name="wedding_id" value={id} />
                              <input type="hidden" name="member_id" value={row.member_id} />
                              <input type="hidden" name="paid" value={pay?.paid_at ? "false" : "true"} />
                              <SubmitButton className="ghost !px-2 !py-1 !text-xs" pendingLabel="…">
                                {pay?.paid_at ? messages.common.undo : messages.weddings.markPaid}
                              </SubmitButton>
                            </form>
                            <form action={unassignMember}>
                              <input type="hidden" name="wedding_id" value={id} />
                              <input type="hidden" name="member_id" value={row.member_id} />
                              <ConfirmSubmit message={fill(messages.weddings.removePerson, { name: one(row.profiles)?.full_name ?? messages.common.teamMember })}>
                                {messages.common.remove}
                              </ConfirmSubmit>
                            </form>
                          </span>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            {admin ? <AssignForm weddingId={id} members={members.data ?? []} /> : null}
          </Section>

          <Section title={messages.weddings.files}>
            {signed.length === 0 ? (
              <EmptyState>{messages.weddings.noFiles}</EmptyState>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {signed.map((file) => (
                  <li key={file.id} className="flex items-center justify-between gap-2">
                    {file.url ? (
                      <a href={file.url} target="_blank" rel="noreferrer" className="min-w-0 truncate">
                        {file.file_name}
                      </a>
                    ) : (
                      <span className="min-w-0 truncate">{file.file_name}</span>
                    )}
                    {admin ? (
                      <form action={deleteWeddingFile}>
                        <input type="hidden" name="id" value={file.id} />
                        <input type="hidden" name="wedding_id" value={id} />
                        <ConfirmSubmit message={fill(messages.weddings.deleteFile, { name: file.file_name })}>{messages.common.delete}</ConfirmSubmit>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            <FileForm weddingId={id} />
          </Section>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface px-5 py-4">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">{label}</p>
      <div className="mt-1 text-sm font-medium">{children}</div>
    </div>
  );
}
