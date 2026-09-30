import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmSubmit, ExtraPriceFields, LineList, OfferPackageFields, SubmitButton } from "@/components/client";
import {
  AssignForm,
  FileForm,
  MarkPaidForm,
  NoteForm,
  PaymentForm,
  TaskForm,
  TaskStatusForm,
  WeddingDayForm,
  WeddingForm,
  WeddingPlaceForm,
} from "@/components/record-forms";
import { Badge, Banner, Card, Disclosure, EmptyState, PageHeader, Section, StatusBadge, coupleName } from "@/components/ui";
import { addWeddingExtra, deletePayment, deleteTask, deleteWeddingFile, removeWeddingDay, removeWeddingExtra, removeWeddingPlace, resetWeddingFeatures, saveWeddingFeatures, saveWeddingOffer, setCrewPaid, unassignMember, updateWeddingExtra } from "@/lib/actions";
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
  searchParams: Promise<{ error?: string; notice?: string; edit?: string }>;
}) {
  const profile = await requireUser();
  const locale = await getLocale();
  const messages = getMessages(locale);
  const { id } = await params;
  const { error, notice, edit } = await searchParams;
  const admin = profile.role === "admin";
  const today = todayInTunis();
  const supabase = await createClient();

  const { data: wedding } = await supabase
    .from("weddings")
    .select("*, clients(id, partner_one_name, partner_two_name, phone), packages(name, features)")
    .eq("id", id)
    .maybeSingle();
  if (!wedding) notFound();

  const skip = Promise.resolve({ data: [] });
  let taskQuery = supabase
    .from("tasks")
    .select("id, wedding_id, title, due_date, status, assignee_id")
    .eq("wedding_id", id)
    .order("created_at");
  if (!admin) taskQuery = taskQuery.eq("assignee_id", profile.id);
  const [sameDay, sameExtraDay, tasks, notes, assignments, files, payments, clients, packages, members, extras, weddingExtras, days, places] = await Promise.all([
    supabase.from("weddings").select("id").eq("wedding_date", wedding.wedding_date).neq("id", id).neq("status", "cancelled"),
    supabase
      .from("wedding_days")
      .select("wedding_id, weddings!inner(status)")
      .eq("day_date", wedding.wedding_date)
      .neq("wedding_id", id),
    taskQuery,
    supabase.from("notes").select("id, body, created_at, profiles(full_name)").eq("wedding_id", id).order("created_at", { ascending: false }),
    supabase
      .from("wedding_assignments")
      .select("member_id, role_on_day, profiles(full_name, job), assignment_pay(amount_millimes, paid_at)")
      .eq("wedding_id", id),
    supabase.from("files").select("id, file_name, storage_path, created_at").eq("wedding_id", id).order("created_at", { ascending: false }),
    admin
      ? supabase.from("payments").select("id, label, amount_millimes, due_date, paid_at, method, note").eq("wedding_id", id).order("due_date", { nullsFirst: false })
      : skip,
    admin ? supabase.from("clients").select("id, partner_one_name, partner_two_name").order("partner_one_name") : skip,
    admin ? supabase.from("packages").select("id, name, price_millimes").order("name") : skip,
    supabase.from("profiles").select("id, full_name").eq("active", true).order("full_name"),
    admin ? supabase.from("extras").select("id, name, price_millimes").eq("active", true).order("name") : skip,
    admin ? supabase.from("wedding_extras").select("id, name, price_millimes").eq("wedding_id", id).order("created_at") : skip,
    supabase.from("wedding_days").select("id, day_date, start_time, label").eq("wedding_id", id).order("day_date"),
    supabase.from("wedding_locations").select("id, label, venue_name, city, location_url").eq("wedding_id", id).order("created_at"),
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
  const extraLines = weddingExtras.data ?? [];
  const extrasSum = extraLines.reduce((sum, line) => sum + line.price_millimes, 0);
  const offerLocked = wedding.package_price_millimes != null || extraLines.length > 0;
  const offerTotal = offerLocked ? (wedding.package_price_millimes ?? 0) + extrasSum : wedding.total_millimes;
  const agreedBase =
    wedding.package_price_millimes != null
      ? wedding.package_price_millimes
      : wedding.package_id
        ? Math.max(0, wedding.total_millimes - extrasSum)
        : null;
  const packagePriceDefault = agreedBase != null ? (agreedBase / 1000).toFixed(3) : "";
  const editingPayment = (payments.data ?? []).find((payment) => payment.id === edit) ?? null;
  const paidTotal = (payments.data ?? []).filter((p) => p.paid_at).reduce((sum, p) => sum + p.amount_millimes, 0);
  const remaining = wedding.total_millimes - paidTotal;
  const openTasks = (tasks.data ?? []).filter((task) => task.status !== "done").length;
  const place = [wedding.venue_name, wedding.city, wedding.governorate].filter(Boolean).join(", ");
  const extraDays = days.data ?? [];
  const extraPlaces = places.data ?? [];
  const included = (wedding.features ?? pack?.features ?? []) as string[];
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
        action={
          admin ? (
            <Link href={`/weddings/${id}/contract`} className="button no-underline">
              {messages.contract.open}
            </Link>
          ) : null
        }
      />
      <Banner error={error} notice={notice} />
      {(sameDay.data ?? []).length > 0 || (sameExtraDay.data ?? []).some((row) => one(row.weddings)?.status !== "cancelled") ? (
        <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {messages.weddings.sameDay}
        </p>
      ) : null}

      <Card className="mb-6 grid gap-px overflow-hidden bg-line sm:grid-cols-2 lg:grid-cols-4">
        <Fact label={messages.weddings.date}>
          <span className="block">
            {formatDate(wedding.wedding_date, locale)}
            {wedding.start_time ? <span className="text-muted"> · {wedding.start_time.slice(0, 5)}</span> : null}
          </span>
          {extraDays.length > 2 ? (
            <span className="mt-1 block text-xs font-normal text-muted">
              {fill(messages.weddings.otherDaysCount, { count: extraDays.length })}
            </span>
          ) : (
            extraDays.map((day) => (
              <span key={day.id} className="mt-1 block text-xs font-normal text-muted">
                {formatDate(day.day_date, locale)}
                {day.start_time ? ` · ${day.start_time.slice(0, 5)}` : ""}
                {day.label ? ` · ${day.label}` : ""}
              </span>
            ))
          )}
        </Fact>
        <Fact label={messages.weddings.place}>
          <span className="block">{place || messages.common.notSet}</span>
          {wedding.location_url ? (
            <a href={wedding.location_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-sm font-medium">
              {messages.weddings.openMap}
            </a>
          ) : null}
          {extraPlaces.length > 0 ? (
            <span className="mt-1 block text-xs font-normal text-muted">
              {fill(messages.weddings.otherPlacesCount, { count: extraPlaces.length })}
            </span>
          ) : null}
        </Fact>
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
            <span>
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
          <WeddingForm wedding={wedding} clients={clients.data ?? []} packages={packages.data ?? []} lockTotal={offerLocked} />
        </Disclosure>
      ) : null}

      <Section title={messages.weddings.schedule} className="mb-6">
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <p className="text-xs font-medium tracking-wide text-muted uppercase">{messages.weddings.date}</p>
            <ul className="mt-2 divide-y divide-line">
              <li className="flex items-center justify-between gap-3 py-3 text-sm">
                <span>
                  <span className="font-medium">{formatDate(wedding.wedding_date, locale)}</span>
                  {wedding.start_time ? <span className="text-muted"> · {wedding.start_time.slice(0, 5)}</span> : null}
                  <span className="mt-0.5 block text-xs text-muted">{messages.weddings.mainDay}</span>
                </span>
              </li>
              {extraDays.map((day) => {
                const label = day.label || formatDate(day.day_date, locale);
                return (
                  <li key={day.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <span>
                      <span className="font-medium">{formatDate(day.day_date, locale)}</span>
                      {day.start_time ? <span className="text-muted"> · {day.start_time.slice(0, 5)}</span> : null}
                      {day.label ? <span className="mt-0.5 block text-xs text-muted">{day.label}</span> : null}
                    </span>
                    {admin ? (
                      <form action={removeWeddingDay}>
                        <input type="hidden" name="id" value={day.id} />
                        <input type="hidden" name="wedding_id" value={id} />
                        <ConfirmSubmit message={fill(messages.weddings.removeDay, { label })}>{messages.common.remove}</ConfirmSubmit>
                      </form>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {admin ? (
              <Fold label={messages.weddings.addDay} open={error === "add_day_failed" || error === "day_is_main" || error === "day_exists"}>
                <WeddingDayForm weddingId={id} />
              </Fold>
            ) : null}
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted uppercase">{messages.weddings.place}</p>
            <ul className="mt-2 divide-y divide-line">
              <li className="py-3 text-sm">
                <span className="font-medium">{place || messages.common.notSet}</span>
                <span className="mt-0.5 block text-xs text-muted">{messages.weddings.mainPlace}</span>
                {wedding.location_url ? (
                  <a href={wedding.location_url} target="_blank" rel="noopener noreferrer" className="text-xs">
                    {messages.weddings.openMap}
                  </a>
                ) : null}
              </li>
              {extraPlaces.map((spot) => {
                const where = [spot.venue_name, spot.city].filter(Boolean).join(", ");
                const label = spot.label || where || messages.weddings.place;
                return (
                  <li key={spot.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <span className="min-w-0">
                      <span className="block font-medium">{label}</span>
                      {spot.label && where ? <span className="block text-xs text-muted">{where}</span> : null}
                      {spot.location_url ? (
                        <a href={spot.location_url} target="_blank" rel="noopener noreferrer" className="text-xs">
                          {messages.weddings.openMap}
                        </a>
                      ) : null}
                    </span>
                    {admin ? (
                      <form action={removeWeddingPlace}>
                        <input type="hidden" name="id" value={spot.id} />
                        <input type="hidden" name="wedding_id" value={id} />
                        <ConfirmSubmit message={fill(messages.weddings.removePlace, { label })}>{messages.common.remove}</ConfirmSubmit>
                      </form>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {admin ? (
              <Fold label={messages.weddings.addPlace} open={error === "add_place_failed" || error === "err_place"}>
                <WeddingPlaceForm weddingId={id} />
              </Fold>
            ) : null}
          </div>
        </div>
      </Section>

      {admin ? null : (
        <Section title={messages.weddings.inclusions} className="mb-6">
          <FeatureList lines={included} empty={messages.weddings.noInclusions} />
        </Section>
      )}

      {admin ? (
        <Section title={messages.weddings.offer} className="mb-6">
          <p className="mb-4 text-sm text-muted">{messages.weddings.offerHint}</p>
          <form action={saveWeddingOffer} className="flex flex-col gap-4">
            <input type="hidden" name="wedding_id" value={id} />
            <OfferPackageFields
              packages={packages.data ?? []}
              packageId={wedding.package_id ?? ""}
              price={packagePriceDefault}
              labels={{
                package: messages.forms.package,
                basePrice: messages.weddings.basePrice,
                none: messages.common.none,
              }}
            />
            <div>
              <SubmitButton pendingLabel={messages.common.saving}>{messages.weddings.saveOffer}</SubmitButton>
            </div>
          </form>

          <div className="mt-6 border-t border-line pt-4">
            <p className="text-sm font-medium">{messages.weddings.inclusions}</p>
            <div className="mt-2">
              <FeatureList lines={included} empty={messages.weddings.noInclusions} />
            </div>
            <Fold label={messages.weddings.editInclusions} open={error === "err_features" || error === "save_inclusions_failed"}>
              <p className="mb-3 text-xs text-muted">{messages.weddings.inclusionsHint}</p>
              <form action={saveWeddingFeatures} className="flex flex-col gap-4">
                <input type="hidden" name="wedding_id" value={id} />
                <LineList
                  key={included.join("\n")}
                  name="feature"
                  lines={included}
                  addLabel={messages.packages.addLine}
                  placeholder={messages.packages.featurePlaceholder}
                  removeLabel={messages.common.remove}
                />
                <div>
                  <SubmitButton pendingLabel={messages.common.saving}>{messages.weddings.saveInclusions}</SubmitButton>
                </div>
              </form>
              {wedding.package_id ? (
                <form action={resetWeddingFeatures} className="mt-3">
                  <input type="hidden" name="wedding_id" value={id} />
                  <ConfirmSubmit className="ghost" message={messages.weddings.resetInclusionsConfirm}>
                    {messages.weddings.resetInclusions}
                  </ConfirmSubmit>
                </form>
              ) : null}
            </Fold>
          </div>

          {extraLines.length === 0 ? (
            <p className="mt-6 text-sm text-muted">{messages.weddings.noExtras}</p>
          ) : (
            <ul className="mt-6 divide-y divide-line">
              {extraLines.map((line) => (
                <li key={line.id} className="flex flex-wrap items-end justify-between gap-3 py-3">
                  <span className="pb-2 text-sm font-medium">{line.name}</span>
                  <span className="flex flex-wrap items-center gap-2">
                    <form action={updateWeddingExtra} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={line.id} />
                      <input type="hidden" name="wedding_id" value={id} />
                      <input
                        name="price"
                        inputMode="decimal"
                        className="w-28"
                        aria-label={messages.weddings.extraPrice}
                        defaultValue={(line.price_millimes / 1000).toFixed(3)}
                        required
                      />
                      <SubmitButton className="ghost" pendingLabel={messages.common.saving}>
                        {messages.weddings.saveExtraPrice}
                      </SubmitButton>
                    </form>
                    <form action={removeWeddingExtra}>
                      <input type="hidden" name="id" value={line.id} />
                      <input type="hidden" name="wedding_id" value={id} />
                      <ConfirmSubmit message={fill(messages.weddings.removeExtra, { name: line.name })}>{messages.common.remove}</ConfirmSubmit>
                    </form>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {(extras.data ?? []).length === 0 ? (
            <p className="mt-4 text-sm text-muted">{messages.weddings.noExtrasCatalog}</p>
          ) : (
            <form action={addWeddingExtra} className="mt-4 flex flex-col gap-4 border-t border-line pt-4">
              <input type="hidden" name="wedding_id" value={id} />
              <ExtraPriceFields
                extras={extras.data ?? []}
                labels={{
                  extra: messages.weddings.addExtra,
                  price: messages.weddings.extraPrice,
                  choose: messages.common.choose,
                }}
              />
              <div>
                <SubmitButton pendingLabel={messages.common.saving}>{messages.weddings.addExtra}</SubmitButton>
              </div>
            </form>
          )}

          <p className="mt-4 text-sm font-medium">
            {messages.weddings.agreed}: {formatTnd(offerTotal)}
          </p>
          {offerLocked ? <p className="mt-1 text-xs text-muted">{messages.weddings.fromOffer}</p> : null}
        </Section>
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
            <TaskForm weddingId={id} members={members.data ?? []} lockedAssignee={admin ? undefined : profile.id} />
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
                        <span className="flex flex-wrap items-center justify-end gap-2">
                          {payment.paid_at ? null : <MarkPaidForm paymentId={payment.id} returnTo={backPath} />}
                          <Link href={`${backPath}?edit=${payment.id}#payment-editor`} className="text-sm">
                            {messages.common.edit}
                          </Link>
                          <form action={deletePayment}>
                            <input type="hidden" name="id" value={payment.id} />
                            <input type="hidden" name="return_to" value={backPath} />
                            <ConfirmSubmit message={fill(messages.payments.deleteConfirm, { name: payment.label })}>
                              {messages.common.delete}
                            </ConfirmSubmit>
                          </form>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div id="payment-editor" className="mt-4 border-t border-line pt-4">
                <Disclosure label={editingPayment ? messages.payments.edit : messages.weddings.recordPayment} open={Boolean(editingPayment)}>
                  <PaymentForm
                    key={editingPayment?.id ?? "new"}
                    weddingId={id}
                    returnTo={backPath}
                    cancelHref={editingPayment ? backPath : undefined}
                    payment={
                      editingPayment
                        ? {
                            id: editingPayment.id,
                            wedding_id: id,
                            label: editingPayment.label,
                            amount_millimes: editingPayment.amount_millimes,
                            due_date: editingPayment.due_date,
                            paid_at: editingPayment.paid_at,
                            method: editingPayment.method,
                            note: editingPayment.note ?? "",
                          }
                        : undefined
                    }
                  />
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
                          <span className={`text-xs ${pay?.paid_at ? "text-ink" : "text-muted"}`}>
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

function FeatureList({ lines, empty }: { lines: string[]; empty: string }) {
  if (lines.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm">
      {lines.map((line, index) => (
        <li key={`${index}-${line}`}>{line}</li>
      ))}
    </ul>
  );
}

function Fold({ label, open, children }: { label: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="group mt-4 border-t border-line pt-3">
      <summary className="flex cursor-pointer items-center justify-between text-sm font-medium">
        <span>{label}</span>
        <span className="text-muted transition-transform group-open:rotate-45" aria-hidden>
          +
        </span>
      </summary>
      <div className="pt-4">{children}</div>
    </details>
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
