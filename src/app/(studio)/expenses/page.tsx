import Link from "next/link";
import { ExpenseForm } from "@/components/record-forms";
import { Banner, Disclosure, EmptyRow, PageHeader, Pagination, TableCard, coupleName } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { PAGE_SIZE, formatDate, one } from "@/lib/constants";
import { getMessages } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { formatTnd } from "@/lib/money";
import { weddingOptions } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  return { title: getMessages(await getLocale()).nav.expenses };
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; page?: string }>;
}) {
  await requireAdmin();
  const locale = await getLocale();
  const messages = getMessages(locale);
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const supabase = await createClient();
  const [expenses, options] = await Promise.all([
    supabase
      .from("expenses")
      .select("id, category, amount_millimes, spent_on, note, wedding_id, weddings(clients(partner_one_name, partner_two_name))", { count: "exact" })
      .order("spent_on", { ascending: false })
      .range(from, from + PAGE_SIZE - 1),
    weddingOptions(supabase, locale, messages.common.wedding),
  ]);

  return (
    <div>
      <PageHeader title={messages.expenses.title} subtitle={messages.expenses.subtitle} />
      <Banner error={params.error} notice={params.notice} />
      <Disclosure label={messages.expenses.newExpense} open={Boolean(params.error)}>
        <ExpenseForm weddings={options} />
      </Disclosure>
      <TableCard>
        <table>
          <thead>
            <tr>
              <th>{messages.expenses.date}</th>
              <th>{messages.expenses.category}</th>
              <th>{messages.expenses.amount}</th>
              <th>{messages.expenses.wedding}</th>
            </tr>
          </thead>
          <tbody>
            {(expenses.data ?? []).map((expense) => {
              const client = one(one(expense.weddings)?.clients);
              return (
                <tr key={expense.id}>
                  <td className="whitespace-nowrap">{formatDate(expense.spent_on, locale)}</td>
                  <td>
                    <span className="font-medium">{expense.category}</span>
                    {expense.note ? <span className="block text-xs text-muted">{expense.note}</span> : null}
                  </td>
                  <td className="font-medium whitespace-nowrap">{formatTnd(expense.amount_millimes)}</td>
                  <td>
                    {expense.wedding_id && client ? (
                      <Link href={`/weddings/${expense.wedding_id}`}>{coupleName(client.partner_one_name, client.partner_two_name)}</Link>
                    ) : (
                      <span className="text-muted">{messages.common.studio}</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {(expenses.data ?? []).length === 0 ? <EmptyRow colSpan={4}>{messages.expenses.empty}</EmptyRow> : null}
          </tbody>
        </table>
      </TableCard>
      <Pagination page={page} count={expenses.count ?? 0} path="/expenses" />
    </div>
  );
}
