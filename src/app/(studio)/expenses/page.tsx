import Link from "next/link";
import { ConfirmSubmit } from "@/components/client";
import { ExpenseForm } from "@/components/record-forms";
import { Banner, Disclosure, EmptyRow, EmptyState, PageHeader, Pagination, PhoneCard, PhoneList, TableCard, coupleName } from "@/components/ui";
import { deleteExpense } from "@/lib/actions";
import { requireManager } from "@/lib/auth";
import { PAGE_SIZE, formatDate, one } from "@/lib/constants";
import { fill, getMessages } from "@/lib/i18n";
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
  searchParams: Promise<{ error?: string; notice?: string; page?: string; edit?: string }>;
}) {
  await requireManager();
  const locale = await getLocale();
  const messages = getMessages(locale);
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const supabase = await createClient();
  const returnTo = page > 1 ? `/expenses?page=${page}` : "/expenses";
  const editHref = (id: string) => (page > 1 ? `/expenses?page=${page}&edit=${id}#expense-editor` : `/expenses?edit=${id}#expense-editor`);
  const [expenses, options, editingExpense] = await Promise.all([
    supabase
      .from("expenses")
      .select("id, category, amount_millimes, spent_on, note, wedding_id, weddings(clients(partner_one_name, partner_two_name))", { count: "exact" })
      .order("spent_on", { ascending: false })
      .range(from, from + PAGE_SIZE - 1),
    weddingOptions(supabase, locale, messages.common.wedding),
    params.edit
      ? supabase.from("expenses").select("id, category, amount_millimes, spent_on, note, wedding_id").eq("id", params.edit).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const editing = editingExpense.data;

  return (
    <div>
      <PageHeader title={messages.expenses.title} subtitle={messages.expenses.subtitle} />
      <Banner error={params.error} notice={params.notice} />
      <div id="expense-editor">
      <Disclosure label={editing ? messages.expenses.edit : messages.expenses.newExpense} open={Boolean(params.error) || Boolean(editing)}>
        <ExpenseForm
          key={editing?.id ?? "new"}
          weddings={options}
          expense={editing ?? undefined}
          returnTo={returnTo}
          cancelHref={editing ? returnTo : undefined}
        />
      </Disclosure>
      </div>
      <PhoneList>
        {(expenses.data ?? []).length === 0 ? (
          <EmptyState>{messages.expenses.empty}</EmptyState>
        ) : (
          (expenses.data ?? []).map((expense) => {
            const client = one(one(expense.weddings)?.clients);
            return (
              <PhoneCard key={expense.id}>
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block font-medium">{expense.category}</span>
                    {expense.note ? <span className="block text-xs text-muted">{expense.note}</span> : null}
                    <span className="mt-1 block text-sm text-muted">{formatDate(expense.spent_on, locale)}</span>
                  </span>
                  <span className="shrink-0 font-medium">{formatTnd(expense.amount_millimes)}</span>
                </span>
                <span className="mt-2 block text-sm">
                  {expense.wedding_id && client ? (
                    <Link href={`/weddings/${expense.wedding_id}`}>{coupleName(client.partner_one_name, client.partner_two_name)}</Link>
                  ) : (
                    <span className="text-muted">{messages.common.studio}</span>
                  )}
                </span>
                <span className="mt-3 flex items-center gap-3 border-t border-line pt-3">
                  <Link href={editHref(expense.id)} className="text-sm">
                    {messages.common.edit}
                  </Link>
                  <form action={deleteExpense}>
                    <input type="hidden" name="id" value={expense.id} />
                    <input type="hidden" name="return_to" value={returnTo} />
                    <ConfirmSubmit message={fill(messages.expenses.deleteConfirm, { name: expense.category })}>
                      {messages.common.delete}
                    </ConfirmSubmit>
                  </form>
                </span>
              </PhoneCard>
            );
          })
        )}
      </PhoneList>
      <TableCard className="hidden md:block">
        <table>
          <thead>
            <tr>
              <th>{messages.expenses.date}</th>
              <th>{messages.expenses.category}</th>
              <th>{messages.expenses.amount}</th>
              <th>{messages.expenses.wedding}</th>
              <th />
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
                  <td>
                    <span className="flex items-center justify-end gap-2">
                      <Link href={editHref(expense.id)} className="text-sm">
                        {messages.common.edit}
                      </Link>
                      <form action={deleteExpense}>
                        <input type="hidden" name="id" value={expense.id} />
                        <input type="hidden" name="return_to" value={returnTo} />
                        <ConfirmSubmit message={fill(messages.expenses.deleteConfirm, { name: expense.category })}>
                          {messages.common.delete}
                        </ConfirmSubmit>
                      </form>
                    </span>
                  </td>
                </tr>
              );
            })}
            {(expenses.data ?? []).length === 0 ? <EmptyRow colSpan={5}>{messages.expenses.empty}</EmptyRow> : null}
          </tbody>
        </table>
      </TableCard>
      <Pagination page={page} count={expenses.count ?? 0} path="/expenses" />
    </div>
  );
}
