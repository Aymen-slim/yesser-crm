import Link from "next/link";
import {
  addWeddingDay,
  addWeddingPlace,
  assignMember,
  convertLead,
  markPaymentPaid,
  quickBook,
  saveClient,
  saveExpense,
  saveExtra,
  saveInvoice,
  saveLead,
  saveNote,
  savePackage,
  savePayment,
  saveTask,
  saveWedding,
  uploadWeddingFile,
} from "@/lib/actions";
import {
  GOVERNORATES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  PAYMENT_METHODS,
  TASK_STATUSES,
  WEDDING_STATUSES,
  todayInTunis,
} from "@/lib/constants";
import { LineList, PhoneInput, SubmitButton } from "@/components/client";
import { Field } from "@/components/ui";
import { fill, getMessages, term, type Messages } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { formatTnd } from "@/lib/money";

const formGrid = "grid gap-4 pb-5 md:grid-cols-2";

async function copy() {
  return getMessages(await getLocale());
}

function Options({ values, messages }: { values: readonly string[]; messages: Messages }) {
  return (
    <>
      {values.map((value) => (
        <option key={value} value={value}>
          {term(messages, value)}
        </option>
      ))}
    </>
  );
}

function FormActions({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-4 md:col-span-2">{children}</div>;
}

function CouplePhoneFields({
  contact,
  messages,
}: {
  contact?: { phone: string; whatsapp_phone?: string | null };
  messages: Messages;
}) {
  return (
    <>
      <Field label={messages.forms.phone}>
        <PhoneInput name="phone" defaultValue={contact?.phone} error={messages.flash.err_phone} required />
        <span className="text-xs text-muted">{messages.forms.phoneHint}</span>
      </Field>
      <Field label={messages.forms.whatsappPhone}>
        <PhoneInput name="whatsapp_phone" defaultValue={contact?.whatsapp_phone} error={messages.flash.err_phone} />
        <span className="text-xs text-muted">{messages.forms.whatsappHint}</span>
      </Field>
    </>
  );
}

async function BookAnyway() {
  const f = (await copy()).forms;
  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      <input type="checkbox" name="allow_double" />
      {f.bookAnyway}
    </label>
  );
}

export async function LeadForm({
  lead,
  packages,
}: {
  lead?: {
    id: string;
    partner_one_name: string;
    partner_two_name: string;
    phone: string;
    whatsapp_phone?: string | null;
    email: string | null;
    source: string;
    city: string;
    venue: string;
    wedding_date: string | null;
    status: string;
    package_id: string | null;
  };
  packages: { id: string; name: string }[];
}) {
  const messages = await copy();
  const f = messages.forms;
  return (
    <form action={saveLead} className={formGrid}>
      {lead ? <input type="hidden" name="id" value={lead.id} /> : null}
      <Field label={f.partnerOne}>
        <input name="partner_one_name" defaultValue={lead?.partner_one_name} required />
      </Field>
      <Field label={f.partnerTwo}>
        <input name="partner_two_name" defaultValue={lead?.partner_two_name} />
      </Field>
      <CouplePhoneFields contact={lead} messages={messages} />
      <Field label={f.email}>
        <input name="email" type="email" defaultValue={lead?.email ?? ""} />
      </Field>
      <Field label={f.source}>
        <select name="source" defaultValue={lead?.source ?? "instagram"}>
          <Options values={LEAD_SOURCES} messages={messages} />
        </select>
      </Field>
      <Field label={f.status}>
        <select name="status" defaultValue={lead?.status ?? "new"}>
          <Options values={LEAD_STATUSES} messages={messages} />
        </select>
      </Field>
      <Field label={f.city}>
        <input name="city" defaultValue={lead?.city} />
      </Field>
      <Field label={f.venue}>
        <input name="venue" defaultValue={lead?.venue} />
      </Field>
      <Field label={f.weddingDate}>
        <input name="wedding_date" type="date" defaultValue={lead?.wedding_date ?? ""} />
      </Field>
      <Field label={f.packageInterest}>
        <select name="package_id" defaultValue={lead?.package_id ?? ""}>
          <option value="">{messages.common.none}</option>
          {packages.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </Field>
      <FormActions>
        <SubmitButton pendingLabel={messages.common.saving}>{lead ? f.saveLead : f.addLead}</SubmitButton>
      </FormActions>
    </form>
  );
}

export async function ConvertForm({
  leadId,
  packages,
  defaults,
}: {
  leadId: string;
  packages: { id: string; name: string; price_millimes: number }[];
  defaults: { wedding_date?: string | null; venue?: string; city?: string; package_id?: string | null };
}) {
  const messages = await copy();
  const f = messages.forms;
  const chosen = packages.find((item) => item.id === defaults.package_id);
  const total = chosen ? (chosen.price_millimes / 1000).toFixed(3) : "";
  return (
    <form action={convertLead} className={formGrid}>
      <input type="hidden" name="lead_id" value={leadId} />
      <Field label={f.weddingDate}>
        <input name="wedding_date" type="date" defaultValue={defaults.wedding_date ?? ""} required />
      </Field>
      <Field label={f.startTime}>
        <input name="start_time" type="time" />
      </Field>
      <Field label={f.venue}>
        <input name="venue_name" defaultValue={defaults.venue} />
      </Field>
      <Field label={f.city}>
        <input name="city" defaultValue={defaults.city} />
      </Field>
      <Field label={f.governorate}>
        <select name="governorate" defaultValue="">
          <option value="">{messages.common.choose}</option>
          {GOVERNORATES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={f.status}>
        <select name="status" defaultValue="reserved">
          <Options values={WEDDING_STATUSES} messages={messages} />
        </select>
      </Field>
      <Field label={f.package}>
        <select name="package_id" defaultValue={defaults.package_id ?? ""}>
          <option value="">{messages.common.none}</option>
          {packages.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={f.agreedTotal}>
        <input name="total" inputMode="decimal" placeholder="0.000" defaultValue={total} required />
      </Field>
      <Field label={f.dayPlan} wide>
        <textarea name="day_plan" rows={3} />
      </Field>
      <FormActions>
        <SubmitButton pendingLabel={messages.common.booking}>{f.createCouple}</SubmitButton>
        <BookAnyway />
      </FormActions>
    </form>
  );
}

export async function QuickBookForm({ date }: { date: string }) {
  const messages = await copy();
  const f = messages.forms;
  return (
    <form action={quickBook} className="grid gap-4 pb-1 sm:grid-cols-2 lg:grid-cols-3">
      <Field label={f.weddingDate}>
        <input name="wedding_date" type="date" defaultValue={date} required />
      </Field>
      <Field label={f.partnerOne}>
        <input name="partner_one_name" required />
      </Field>
      <Field label={f.partnerTwo}>
        <input name="partner_two_name" />
      </Field>
      <CouplePhoneFields messages={messages} />
      <Field label={f.venue}>
        <input name="venue_name" />
      </Field>
      <Field label={f.agreedTotal}>
        <input name="total" inputMode="decimal" placeholder={f.optional} />
      </Field>
      <div className="flex flex-wrap items-center gap-4 sm:col-span-2 lg:col-span-3">
        <SubmitButton pendingLabel={messages.common.booking}>{f.bookWedding}</SubmitButton>
        <BookAnyway />
      </div>
    </form>
  );
}

export async function ClientForm({
  client,
}: {
  client?: {
    id: string;
    partner_one_name: string;
    partner_two_name: string;
    phone: string;
    whatsapp_phone?: string | null;
    email: string | null;
    city: string;
  };
}) {
  const messages = await copy();
  const f = messages.forms;
  return (
    <form action={saveClient} className={formGrid}>
      {client ? <input type="hidden" name="id" value={client.id} /> : null}
      <Field label={f.partnerOne}>
        <input name="partner_one_name" defaultValue={client?.partner_one_name} required />
      </Field>
      <Field label={f.partnerTwo}>
        <input name="partner_two_name" defaultValue={client?.partner_two_name} />
      </Field>
      <CouplePhoneFields contact={client} messages={messages} />
      <Field label={f.email}>
        <input name="email" type="email" defaultValue={client?.email ?? ""} />
      </Field>
      <Field label={f.city}>
        <input name="city" defaultValue={client?.city} />
      </Field>
      <FormActions>
        <SubmitButton pendingLabel={messages.common.saving}>{client ? f.saveCouple : f.addCouple}</SubmitButton>
      </FormActions>
    </form>
  );
}

export async function PackageForm({
  item,
}: {
  item?: {
    id: string;
    name: string;
    description: string;
    price_millimes: number;
    coverage_hours: number;
    photo_count: number;
    includes_album: boolean;
    includes_video: boolean;
    includes_drone: boolean;
    active: boolean;
    features?: string[];
  };
}) {
  const messages = await copy();
  const f = messages.forms;
  return (
    <form action={savePackage} className={formGrid}>
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      <Field label={f.name}>
        <input name="name" defaultValue={item?.name} required />
      </Field>
      <Field label={f.price}>
        <input name="price" inputMode="decimal" placeholder="0.000" defaultValue={item ? (item.price_millimes / 1000).toFixed(3) : ""} required />
      </Field>
      <div className="md:col-span-2">
        <p className="text-sm font-medium text-muted">{messages.packages.included}</p>
        <p className="mt-1 mb-3 text-xs text-muted">{messages.packages.includedHint}</p>
        <LineList
          name="feature"
          lines={item?.features ?? []}
          addLabel={messages.packages.addLine}
          placeholder={messages.packages.featurePlaceholder}
          removeLabel={messages.common.remove}
        />
      </div>
      <label className="flex items-center gap-2 text-sm md:col-span-2">
        <input type="checkbox" name="active" defaultChecked={item?.active ?? true} /> {f.offered}
      </label>
      <details className="group rounded-2xl border border-line md:col-span-2">
        <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium">
          <span>{messages.packages.moreDetails}</span>
          <span className="text-muted transition-transform group-open:rotate-45" aria-hidden>
            +
          </span>
        </summary>
        <div className="grid gap-4 border-t border-line px-4 py-4 md:grid-cols-2">
          <Field label={f.coverageHours}>
            <input name="coverage_hours" type="number" min="0" step="0.5" defaultValue={item?.coverage_hours ?? 8} />
          </Field>
          <Field label={f.photoCount}>
            <input name="photo_count" type="number" min="0" defaultValue={item?.photo_count ?? 0} />
          </Field>
          <Field label={f.description} wide>
            <textarea name="description" rows={3} defaultValue={item?.description} />
          </Field>
          <fieldset className="flex flex-wrap gap-x-6 gap-y-2 text-sm md:col-span-2">
            <legend className="mb-2 font-medium text-muted">{f.includes}</legend>
            <label className="flex items-center gap-2"><input type="checkbox" name="includes_album" defaultChecked={item?.includes_album} /> {messages.terms.album}</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="includes_video" defaultChecked={item?.includes_video} /> {messages.terms.video}</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="includes_drone" defaultChecked={item?.includes_drone} /> {messages.terms.drone}</label>
          </fieldset>
        </div>
      </details>
      <FormActions>
        <SubmitButton pendingLabel={messages.common.saving}>{item ? f.savePackage : f.addPackage}</SubmitButton>
      </FormActions>
    </form>
  );
}

export async function ExtraForm({
  item,
}: {
  item?: {
    id: string;
    name: string;
    price_millimes: number;
    active: boolean;
  };
}) {
  const messages = await copy();
  const f = messages.forms;
  return (
    <form action={saveExtra} className={item ? "grid gap-4 sm:grid-cols-[1fr_9rem_auto] sm:items-end" : formGrid}>
      {item ? <input type="hidden" name="id" value={item.id} className="hidden" /> : null}
      <Field label={f.name}>
        <input name="name" defaultValue={item?.name} required />
      </Field>
      <Field label={f.price}>
        <input name="price" inputMode="decimal" placeholder="0.000" defaultValue={item ? (item.price_millimes / 1000).toFixed(3) : ""} required />
      </Field>
      <label className={`flex items-center gap-2 text-sm ${item ? "pb-3" : ""}`}>
        <input type="checkbox" name="active" defaultChecked={item?.active ?? true} />
        {messages.packages.extraOffered}
      </label>
      <FormActions>
        <SubmitButton pendingLabel={messages.common.saving}>{item ? messages.common.save : f.addExtra}</SubmitButton>
      </FormActions>
    </form>
  );
}

export async function WeddingDayForm({ weddingId }: { weddingId: string }) {
  const messages = await copy();
  const f = messages.forms;
  return (
    <form action={addWeddingDay} className={`${formGrid} pb-0`}>
      <input type="hidden" name="wedding_id" value={weddingId} />
      <Field label={f.date}>
        <input name="day_date" type="date" required />
      </Field>
      <Field label={f.start}>
        <input name="start_time" type="time" />
      </Field>
      <Field label={messages.weddings.dayLabel} wide>
        <input name="label" placeholder={messages.weddings.dayLabelHint} maxLength={80} />
      </Field>
      <FormActions>
        <SubmitButton pendingLabel={messages.common.saving}>{messages.weddings.addDay}</SubmitButton>
        <BookAnyway />
      </FormActions>
    </form>
  );
}

export async function WeddingPlaceForm({ weddingId }: { weddingId: string }) {
  const messages = await copy();
  const f = messages.forms;
  return (
    <form action={addWeddingPlace} className={`${formGrid} pb-0`}>
      <input type="hidden" name="wedding_id" value={weddingId} />
      <Field label={messages.weddings.placeLabel}>
        <input name="label" placeholder={messages.weddings.placeLabelHint} maxLength={80} />
      </Field>
      <Field label={f.venue}>
        <input name="venue_name" maxLength={120} />
      </Field>
      <Field label={f.city}>
        <input name="city" maxLength={80} />
      </Field>
      <Field label={f.locationLink} wide>
        <input name="location_url" type="url" inputMode="url" placeholder="https://maps.google.com/..." />
      </Field>
      <FormActions>
        <SubmitButton pendingLabel={messages.common.saving}>{messages.weddings.addPlace}</SubmitButton>
      </FormActions>
    </form>
  );
}

export async function WeddingForm({
  wedding,
  clients,
  packages,
  lockTotal = false,
}: {
  wedding?: {
    id: string;
    client_id: string;
    package_id: string | null;
    wedding_date: string;
    start_time: string | null;
    venue_name: string;
    city: string;
    governorate: string;
    location_url?: string;
    status: string;
    total_millimes: number;
    day_plan: string;
  };
  clients: { id: string; partner_one_name: string; partner_two_name: string }[];
  packages: { id: string; name: string }[];
  lockTotal?: boolean;
}) {
  const messages = await copy();
  const f = messages.forms;
  return (
    <form action={saveWedding} className={formGrid}>
      {wedding ? <input type="hidden" name="id" value={wedding.id} /> : null}
      <Field label={f.couple}>
        <select name="client_id" defaultValue={wedding?.client_id ?? ""} required>
          <option value="">{messages.common.choose}</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.partner_one_name}
              {client.partner_two_name ? ` & ${client.partner_two_name}` : ""}
            </option>
          ))}
        </select>
      </Field>
      <Field label={f.package}>
        <select name="package_id" defaultValue={wedding?.package_id ?? ""}>
          <option value="">{messages.common.none}</option>
          {packages.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={f.date}>
        <input name="wedding_date" type="date" defaultValue={wedding?.wedding_date} required />
      </Field>
      <Field label={f.start}>
        <input name="start_time" type="time" defaultValue={wedding?.start_time?.slice(0, 5) ?? ""} />
      </Field>
      <Field label={f.venue}>
        <input name="venue_name" defaultValue={wedding?.venue_name} />
      </Field>
      <Field label={f.city}>
        <input name="city" defaultValue={wedding?.city} />
      </Field>
      <Field label={f.governorate}>
        <select name="governorate" defaultValue={wedding?.governorate ?? ""}>
          <option value="">{messages.common.choose}</option>
          {GOVERNORATES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={f.locationLink} wide>
        <input name="location_url" type="url" inputMode="url" placeholder="https://maps.google.com/..." defaultValue={wedding?.location_url ?? ""} />
      </Field>
      <Field label={f.status}>
        <select name="status" defaultValue={wedding?.status ?? "reserved"}>
          <Options values={WEDDING_STATUSES} messages={messages} />
        </select>
      </Field>
      {lockTotal ? (
        <input type="hidden" name="total" value={wedding ? (wedding.total_millimes / 1000).toFixed(3) : "0.000"} />
      ) : (
        <Field label={f.agreedTotal}>
          <input name="total" inputMode="decimal" defaultValue={wedding ? (wedding.total_millimes / 1000).toFixed(3) : "0.000"} required />
          <span className="text-xs text-muted">{f.totalHint}</span>
        </Field>
      )}
      <Field label={f.dayPlan} wide>
        <textarea name="day_plan" rows={4} defaultValue={wedding?.day_plan} />
      </Field>
      <FormActions>
        <SubmitButton pendingLabel={messages.common.saving}>{wedding ? f.saveWedding : f.addWedding}</SubmitButton>
        <BookAnyway />
      </FormActions>
    </form>
  );
}

export async function PaymentForm({
  weddings = [],
  weddingId,
  returnTo,
  cancelHref,
  payment,
}: {
  weddings?: { id: string; label: string }[];
  weddingId?: string;
  returnTo?: string;
  cancelHref?: string;
  payment?: {
    id: string;
    wedding_id: string;
    label: string;
    amount_millimes: number;
    due_date: string | null;
    paid_at: string | null;
    method: string | null;
    note: string;
  };
}) {
  const messages = await copy();
  const f = messages.forms;
  return (
    <form action={savePayment} className={formGrid}>
      {payment ? <input type="hidden" name="id" value={payment.id} /> : null}
      {returnTo ? <input type="hidden" name="return_to" value={returnTo} /> : null}
      {weddingId ? (
        <input type="hidden" name="wedding_id" value={weddingId} />
      ) : (
        <Field label={f.wedding}>
          <select name="wedding_id" defaultValue={payment?.wedding_id ?? ""} required>
            <option value="">{messages.common.choose}</option>
            {weddings.map((wedding) => (
              <option key={wedding.id} value={wedding.id}>
                {wedding.label}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label={f.label}>
        <input name="label" placeholder={f.deposit} defaultValue={payment?.label} required />
      </Field>
      <Field label={f.amount}>
        <input
          name="amount"
          inputMode="decimal"
          placeholder="0.000"
          defaultValue={payment ? (payment.amount_millimes / 1000).toFixed(3) : undefined}
          required
        />
      </Field>
      <Field label={f.dueDate}>
        <input name="due_date" type="date" defaultValue={payment?.due_date ?? ""} />
      </Field>
      <Field label={f.paidOn}>
        <input name="paid_at" type="date" defaultValue={payment?.paid_at ?? ""} />
      </Field>
      <Field label={f.method}>
        <select name="method" defaultValue={payment?.method ?? ""}>
          <option value="">{f.notPaidYet}</option>
          <Options values={PAYMENT_METHODS} messages={messages} />
        </select>
      </Field>
      <Field label={f.note} wide={Boolean(weddingId)}>
        <input name="note" defaultValue={payment?.note ?? ""} />
      </Field>
      <FormActions>
        <SubmitButton pendingLabel={messages.common.saving}>{payment ? f.savePayment : f.addPayment}</SubmitButton>
        {payment && cancelHref ? (
          <Link href={cancelHref} className="text-sm text-muted">
            {messages.common.cancel}
          </Link>
        ) : null}
      </FormActions>
    </form>
  );
}

export async function MarkPaidForm({ paymentId, returnTo }: { paymentId: string; returnTo?: string }) {
  const messages = await copy();
  const f = messages.forms;
  return (
    <form action={markPaymentPaid} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={paymentId} />
      {returnTo ? <input type="hidden" name="return_to" value={returnTo} /> : null}
      <input name="paid_at" type="date" required defaultValue={todayInTunis()} className="max-w-40" aria-label={f.paidOn} />
      <select name="method" defaultValue="cash" className="max-w-36" aria-label={f.method}>
        <Options values={PAYMENT_METHODS} messages={messages} />
      </select>
      <SubmitButton className="ghost" pendingLabel="…">
        {f.markPaid}
      </SubmitButton>
    </form>
  );
}

export async function InvoiceForm({
  weddingId,
  payments,
  issuer,
}: {
  weddingId: string;
  payments: { id: string; label: string; amount_millimes: number }[];
  issuer: { name: string; phone: string; address: string; taxId: string };
}) {
  const messages = await copy();
  const invoice = messages.invoice;
  return (
    <form action={saveInvoice} className={formGrid}>
      <input type="hidden" name="wedding_id" value={weddingId} />
      <fieldset className="md:col-span-2">
        <legend className="mb-2 text-sm font-medium text-muted">{invoice.lines}</legend>
        <ul className="divide-y divide-line rounded-lg border border-line">
          {payments.map((payment) => (
            <li key={payment.id}>
              <label className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <input type="checkbox" name="payment_id" value={payment.id} defaultChecked />
                <span className="min-w-0 flex-1">{payment.label}</span>
                <span className="shrink-0 font-medium">{formatTnd(payment.amount_millimes)}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <fieldset className="md:col-span-2">
        <legend className="mb-2 text-sm font-medium text-muted">{invoice.tva}</legend>
        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="tva_mode" value="none" defaultChecked />
            {invoice.tvaNone}
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="tva_mode" value="added" />
            {invoice.tvaAdded}
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="tva_mode" value="included" />
            {invoice.tvaIncluded}
          </label>
        </div>
      </fieldset>
      <Field label={invoice.rate}>
        <input name="tva_rate" inputMode="decimal" defaultValue="19" />
      </Field>
      <Field label={invoice.issued}>
        <input name="issued_on" type="date" defaultValue={todayInTunis()} required />
      </Field>
      <Field label={invoice.note} wide>
        <input name="note" maxLength={500} />
      </Field>
      <Field label={invoice.issuerName}>
        <input name="issuer_name" defaultValue={issuer.name} required maxLength={120} />
      </Field>
      <Field label={invoice.phone}>
        <input name="issuer_phone" defaultValue={issuer.phone} maxLength={40} />
      </Field>
      <Field label={invoice.address} wide>
        <input name="issuer_address" defaultValue={issuer.address} maxLength={240} />
      </Field>
      <Field label={invoice.taxId}>
        <input name="tax_id" defaultValue={issuer.taxId} maxLength={40} />
      </Field>
      <FormActions>
        <SubmitButton pendingLabel={messages.common.saving}>{invoice.create}</SubmitButton>
      </FormActions>
    </form>
  );
}

export async function ExpenseForm({
  weddings,
  expense,
  returnTo,
  cancelHref,
}: {
  weddings: { id: string; label: string }[];
  expense?: {
    id: string;
    wedding_id: string | null;
    category: string;
    amount_millimes: number;
    spent_on: string;
    note: string;
  };
  returnTo?: string;
  cancelHref?: string;
}) {
  const messages = await copy();
  const f = messages.forms;
  return (
    <form action={saveExpense} className={formGrid}>
      {expense ? <input type="hidden" name="id" value={expense.id} /> : null}
      {returnTo ? <input type="hidden" name="return_to" value={returnTo} /> : null}
      <Field label={f.category}>
        <input name="category" placeholder={f.categoryHint} defaultValue={expense?.category} required />
      </Field>
      <Field label={f.amount}>
        <input
          name="amount"
          inputMode="decimal"
          placeholder="0.000"
          defaultValue={expense ? (expense.amount_millimes / 1000).toFixed(3) : undefined}
          required
        />
      </Field>
      <Field label={f.spentOn}>
        <input name="spent_on" type="date" defaultValue={expense?.spent_on ?? todayInTunis()} required />
      </Field>
      <Field label={f.wedding}>
        <select name="wedding_id" defaultValue={expense?.wedding_id ?? ""}>
          <option value="">{f.studioNotWedding}</option>
          {weddings.map((wedding) => (
            <option key={wedding.id} value={wedding.id}>
              {wedding.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label={f.note} wide>
        <input name="note" defaultValue={expense?.note ?? ""} />
      </Field>
      <FormActions>
        <SubmitButton pendingLabel={messages.common.saving}>{expense ? f.saveExpense : f.addExpense}</SubmitButton>
        {expense && cancelHref ? (
          <Link href={cancelHref} className="text-sm text-muted">
            {messages.common.cancel}
          </Link>
        ) : null}
      </FormActions>
    </form>
  );
}

export async function TaskForm({
  weddingId,
  members,
  lockedAssignee,
}: {
  weddingId: string;
  members: { id: string; full_name: string }[];
  lockedAssignee?: string;
}) {
  const messages = await copy();
  const f = messages.forms;
  return (
    <form
      action={saveTask}
      className={`mt-4 grid gap-2 border-t border-line pt-4 ${lockedAssignee ? "sm:grid-cols-[1fr_auto_auto]" : "sm:grid-cols-[1fr_auto_auto_auto]"}`}
    >
      <input type="hidden" name="wedding_id" value={weddingId} />
      <input name="title" placeholder={f.newTask} aria-label={f.task} required />
      <input name="due_date" type="date" aria-label={f.dueDate} />
      {lockedAssignee ? (
        <input type="hidden" name="assignee_id" value={lockedAssignee} />
      ) : (
        <select name="assignee_id" defaultValue="" aria-label={f.assignee}>
          <option value="">{f.unassigned}</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.full_name}
            </option>
          ))}
        </select>
      )}
      <SubmitButton pendingLabel={messages.common.adding}>{messages.common.add}</SubmitButton>
    </form>
  );
}

export async function TaskStatusForm({
  task,
}: {
  task: { id: string; wedding_id: string; title: string; due_date: string | null; status: string; assignee_id: string | null };
}) {
  const messages = await copy();
  const f = messages.forms;
  return (
    <form action={saveTask} className="flex items-center gap-2">
      <input type="hidden" name="id" value={task.id} />
      <input type="hidden" name="wedding_id" value={task.wedding_id} />
      <input type="hidden" name="title" value={task.title} />
      <input type="hidden" name="due_date" value={task.due_date ?? ""} />
      <input type="hidden" name="assignee_id" value={task.assignee_id ?? ""} />
      <select name="status" defaultValue={task.status} className="max-w-28" aria-label={fill(f.statusOf, { title: task.title })}>
        <Options values={TASK_STATUSES} messages={messages} />
      </select>
      <SubmitButton className="ghost" pendingLabel="…">
        {messages.common.update}
      </SubmitButton>
    </form>
  );
}

export async function NoteForm({ weddingId, leadId }: { weddingId?: string; leadId?: string }) {
  const messages = await copy();
  const f = messages.forms;
  return (
    <form action={saveNote} className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
      {weddingId ? <input type="hidden" name="wedding_id" value={weddingId} /> : null}
      {leadId ? <input type="hidden" name="lead_id" value={leadId} /> : null}
      <textarea name="body" rows={3} required placeholder={f.writeNote} aria-label={f.note} />
      <SubmitButton className="self-start" pendingLabel={messages.common.saving}>{f.addNote}</SubmitButton>
    </form>
  );
}

export async function AssignForm({
  weddingId,
  members,
}: {
  weddingId: string;
  members: { id: string; full_name: string }[];
}) {
  const messages = await copy();
  const f = messages.forms;
  return (
    <form action={assignMember} className="mt-4 grid gap-2 border-t border-line pt-4">
      <input type="hidden" name="wedding_id" value={weddingId} />
      <select name="member_id" required aria-label={messages.common.teamMember}>
        <option value="">{f.choosePerson}</option>
        {members.map((member) => (
          <option key={member.id} value={member.id}>
            {member.full_name}
          </option>
        ))}
      </select>
      <input name="role_on_day" placeholder={f.roleHint} aria-label={f.roleAria} />
      <input name="pay" inputMode="decimal" placeholder={f.payHint} aria-label={f.payAria} />
      <SubmitButton className="ghost" pendingLabel={messages.common.saving}>{f.assign}</SubmitButton>
    </form>
  );
}

export async function FileForm({ weddingId }: { weddingId: string }) {
  const messages = await copy();
  const f = messages.forms;
  return (
    <form action={uploadWeddingFile} className="mt-4 grid gap-2 border-t border-line pt-4">
      <input type="hidden" name="wedding_id" value={weddingId} />
      <input name="file" type="file" accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.pdf,image/*,application/pdf" required aria-label={f.file} />
      <p className="text-xs text-muted">{f.fileHint}</p>
      <SubmitButton className="ghost" pendingLabel={messages.common.uploading}>
        {f.upload}
      </SubmitButton>
    </form>
  );
}
