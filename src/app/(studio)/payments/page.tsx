import Link from "next/link";
import { MarkPaidForm, PaymentForm } from "@/components/record-forms";
import {
  Banner,
  Disclosure,
  EmptyRow,
  FilterTabs,
  PageHeader,
  Pagination,
  StatusBadge,
  TableCard,
  coupleName,
} from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { PAGE_SIZE, formatDate, one, todayInTunis } from "@/lib/constants";
import { fill, getMessages, term } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { formatTnd } from "@/lib/money";
import { weddingOptions } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  return { title: getMessages(await getLocale()).nav.payments };
}

const VIEWS = ["unpaid", "overdue", "paid"] as const;

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; page?: string; view?: string }>;
}) {
  await requireAdmin();
  const locale = await getLocale();
  const messages = getMessages(locale);
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const view = VIEWS.find((value) => value === params.view);
  const today = todayInTunis();
  const supabase = await createClient();

  let query = supabase
    .from("payments")
    .select("id, label, amount_millimes, due_date, paid_at, method, wedding_id, weddings(wedding_date, clients(partner_one_name, partner_two_name))", { count: "exact" })
    .range(from, from + PAGE_SIZE - 1);
  if (view === "paid") query = query.not("paid_at", "is", null).order("paid_at", { ascending: false });
  else query = query.order("due_date", { ascending: true, nullsFirst: false });
  if (view === "unpaid") query = query.is("paid_at", null);
  if (view === "overdue") query = query.is("paid_at", null).lt("due_date", today);

  const [payments, options, invoices] = await Promise.all([
    query,
    weddingOptions(supabase, locale, messages.common.wedding),
    supabase
      .from("invoices")
      .select("id, number, wedding_id, weddings(clients(partner_one_name, partner_two_name))")
      .order("created_at", { ascending: false })
      .limit(12),
  ]);
  const returnTo = view ? `/payments?view=${view}` : "/payments";

  return (
    <div>
      <PageHeader title={messages.payments.title} subtitle={messages.payments.subtitle} />
      <Banner error={params.error} notice={params.notice} />
      <Disclosure label={messages.payments.record} open={Boolean(params.error)}>
        <PaymentForm weddings={options} returnTo={returnTo} />
      </Disclosure>
      <FilterTabs
        active={view ?? "all"}
        items={[
          { value: "all", label: messages.terms.all, href: "/payments" },
          ...VIEWS.map((value) => ({ value, label: term(messages, value), href: `/payments?view=${value}` })),
        ]}
      />
      {(invoices.data ?? []).length > 0 ? (
        <p className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="font-medium">{messages.invoice.recent}</span>
          {(invoices.data ?? []).map((invoice) => {
            const wedding = one(invoice.weddings);
            const client = one(wedding?.clients);
            const name = client ? coupleName(client.partner_one_name, client.partner_two_name) : messages.common.wedding;
            return (
              <Link key={invoice.id} href={`/invoices/${invoice.id}`}>
                {invoice.number} · {name}
              </Link>
            );
          })}
        </p>
      ) : null}
      <TableCard>
        <table>
          <thead>
            <tr>
              <th>{messages.payments.wedding}</th>
              <th>{messages.payments.label}</th>
              <th>{messages.payments.amount}</th>
              <th>{messages.payments.status}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(payments.data ?? []).map((payment) => {
              const wedding = one(payment.weddings);
              const client = one(wedding?.clients);
              const overdue = !payment.paid_at && payment.due_date && payment.due_date < today;
              return (
                <tr key={payment.id}>
                  <td>
                    <Link href={`/weddings/${payment.wedding_id}`} className="font-medium">
                      {client ? coupleName(client.partner_one_name, client.partner_two_name) : messages.common.wedding}
                    </Link>
                    {wedding ? <span className="block text-xs text-muted">{formatDate(wedding.wedding_date, locale)}</span> : null}
                    <Link href={`/invoices/new?wedding=${payment.wedding_id}`} className="mt-1 block text-xs">
                      {messages.invoice.make}
                    </Link>
                  </td>
                  <td>{payment.label}</td>
                  <td className="font-medium whitespace-nowrap">{formatTnd(payment.amount_millimes)}</td>
                  <td className="whitespace-nowrap">
                    <StatusBadge status={payment.paid_at ? "paid" : overdue ? "overdue" : "due"} />
                    <span className="block text-xs text-muted">
                      {payment.paid_at
                        ? `${formatDate(payment.paid_at, locale)}${payment.method ? ` · ${term(messages, payment.method)}` : ""}`
                        : payment.due_date
                          ? fill(messages.common.dueOn, { date: formatDate(payment.due_date, locale) })
                          : messages.common.noDueDate}
                    </span>
                  </td>
                  <td>{payment.paid_at ? null : <MarkPaidForm paymentId={payment.id} returnTo={returnTo} />}</td>
                </tr>
              );
            })}
            {(payments.data ?? []).length === 0 ? <EmptyRow colSpan={5}>{messages.payments.empty}</EmptyRow> : null}
          </tbody>
        </table>
      </TableCard>
      <Pagination page={page} count={payments.count ?? 0} path="/payments" query={{ view }} />
    </div>
  );
}
