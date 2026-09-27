import Link from "next/link";
import { PAGE_SIZE } from "@/lib/constants";
import { fill, getMessages, term, translateFlash } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";

export function PageHeader({
  title,
  subtitle,
  action,
  back,
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-8">
      {back ? (
        <Link href={back.href} className="mb-3 inline-block text-sm text-muted no-underline hover:text-ink">
          ← {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-medium tracking-tight">{title}</h1>
          {subtitle ? <div className="mt-1.5 text-sm text-muted">{subtitle}</div> : null}
        </div>
        {action}
      </div>
    </div>
  );
}

export async function Banner({ error, notice }: { error?: string; notice?: string }) {
  if (!error && !notice) return null;
  const locale = await getLocale();
  const text = error ? translateFlash(locale, error) : translateFlash(locale, notice);
  return (
    <p
      role={error ? "alert" : "status"}
      className={`mb-6 rounded-lg border px-4 py-3 text-sm ${
        error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"
      }`}
    >
      {text}
    </p>
  );
}

export function Field({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`flex flex-col gap-1.5 text-sm ${wide ? "md:col-span-2" : ""}`}>
      <span className="font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-surface ${className}`}>{children}</div>;
}

export function Section({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={`p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

export function TableCard({ children }: { children: React.ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">{children}</div>
    </Card>
  );
}

export function Disclosure({
  label,
  open,
  children,
}: {
  label: string;
  open?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={open} className="group mb-6 rounded-xl border border-line bg-surface">
      <summary className="flex items-center justify-between px-5 py-3.5 text-sm font-medium">
        <span>{label}</span>
        <span className="text-muted transition-transform group-open:rotate-45" aria-hidden>
          +
        </span>
      </summary>
      <div className="border-t border-line px-5 pt-5">{children}</div>
    </details>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-10 text-center text-sm text-muted">{children}</p>;
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan}>
        <EmptyState>{children}</EmptyState>
      </td>
    </tr>
  );
}

export function StatCard({
  label,
  value,
  hint,
  href,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  href?: string;
  tone?: "default" | "warn";
}) {
  const body = (
    <Card className="h-full p-5 transition-colors hover:border-stone-300">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">{label}</p>
      <p className={`mt-2 font-display text-2xl ${tone === "warn" ? "text-red-700" : ""}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </Card>
  );
  return href ? (
    <Link href={href} className="no-underline">
      {body}
    </Link>
  ) : (
    body
  );
}

const TONES = {
  gray: "bg-stone-100 text-stone-700 ring-stone-200",
  blue: "bg-sky-50 text-sky-800 ring-sky-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  violet: "bg-violet-50 text-violet-800 ring-violet-200",
  green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  red: "bg-red-50 text-red-800 ring-red-200",
} as const;

type Tone = keyof typeof TONES;

const STATUS_TONES: Record<string, Tone> = {
  new: "blue",
  contacted: "amber",
  quote_sent: "violet",
  booked: "green",
  lost: "gray",
  reserved: "amber",
  confirmed: "blue",
  shot: "violet",
  editing: "violet",
  delivered: "green",
  cancelled: "gray",
  todo: "gray",
  doing: "amber",
  done: "green",
  paid: "green",
  overdue: "red",
  due: "gray",
};

export function Badge({ tone = "gray", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export async function StatusBadge({ status }: { status: string }) {
  const messages = getMessages(await getLocale());
  return <Badge tone={STATUS_TONES[status] ?? "gray"}>{term(messages, status)}</Badge>;
}

export async function Pagination({
  page,
  count,
  path,
  query = {},
}: {
  page: number;
  count: number;
  path: string;
  query?: Record<string, string | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  if (pages <= 1) return null;
  const messages = getMessages(await getLocale());
  const href = (target: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
    params.set("page", String(target));
    return `${path}?${params}`;
  };
  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      <span className="text-muted">{fill(messages.common.page, { page, pages, count })}</span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link className="button ghost no-underline" href={href(page - 1)} prefetch={false}>
            {messages.common.previous}
          </Link>
        ) : null}
        {page < pages ? (
          <Link className="button ghost no-underline" href={href(page + 1)} prefetch={false}>
            {messages.common.next}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function FilterTabs({
  items,
  active,
}: {
  items: { href: string; label: string; value: string }[];
  active: string;
}) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto rounded-lg border border-line bg-surface p-1 text-sm">
      {items.map((item) => (
        <Link
          key={item.value}
          href={item.href}
          className={`rounded-md px-3 py-1.5 whitespace-nowrap no-underline ${
            item.value === active ? "bg-ink text-white" : "text-muted hover:bg-canvas hover:text-ink"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}

export async function MonthNav({
  path,
  prev,
  next,
  isCurrent,
}: {
  path: string;
  prev: string;
  next: string;
  isCurrent: boolean;
}) {
  const messages = getMessages(await getLocale());
  return (
    <div className="flex gap-2">
      <Link className="button ghost no-underline" href={`${path}?month=${prev}`} prefetch={false}>
        ← {messages.common.previous}
      </Link>
      {isCurrent ? null : (
        <Link className="button ghost no-underline" href={path} prefetch={false}>
          {messages.common.thisMonth}
        </Link>
      )}
      <Link className="button ghost no-underline" href={`${path}?month=${next}`} prefetch={false}>
        {messages.common.next} →
      </Link>
    </div>
  );
}

export function InstagramLink({ handle }: { handle: string }) {
  if (!handle) return <span className="text-muted">—</span>;
  return (
    <a href={`https://instagram.com/${handle}`} target="_blank" rel="noreferrer">
      @{handle}
    </a>
  );
}

export function coupleName(one: string, two?: string | null) {
  return two ? `${one} & ${two}` : one;
}
