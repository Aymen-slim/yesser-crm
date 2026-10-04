import Link from "next/link";
import { PAGE_SIZE, normalizePhone } from "@/lib/constants";
import { fill, getMessages, term, translateFlash } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";

export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-2xl bg-accent text-ink ${className}`} aria-hidden>
      <svg viewBox="0 0 24 24" className="h-[58%] w-[58%]" fill="currentColor">
        <path d="M12 1.5l2.1 8.4L22.5 12l-8.4 2.1L12 22.5l-2.1-8.4L1.5 12l8.4-2.1z" />
      </svg>
    </span>
  );
}

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
          <h1 className="font-display text-4xl font-semibold tracking-tight">{title}</h1>
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
      className={`mb-6 rounded-2xl px-4 py-3 text-sm ${
        error ? "bg-red-50 text-red-800" : "bg-accent-soft text-ink"
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
  return <div className={`rounded-[1.5rem] bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.04)] ${className}`}>{children}</div>;
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
    <Card className={`p-6 ${className}`}>
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
    <details open={open} className="group mb-6 rounded-[1.5rem] bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
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

const METER = {
  ink: "bg-ink",
  accent: "bg-accent",
  mid: "bg-track-mid",
} as const;

export function Meter({ segments }: { segments: { value: number; tone: keyof typeof METER }[] }) {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);
  return (
    <div className="flex h-2.5 overflow-hidden rounded-full bg-track">
      {total === 0
        ? null
        : segments.map((segment, index) =>
            segment.value > 0 ? (
              <div key={index} className={METER[segment.tone]} style={{ width: `${(segment.value / total) * 100}%` }} />
            ) : null,
          )}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  href,
  tone = "default",
  footer,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  href?: string;
  tone?: "default" | "warn";
  footer?: React.ReactNode;
}) {
  const body = (
    <Card className="h-full p-6 transition-shadow hover:shadow-[0_12px_32px_rgba(0,0,0,0.06)]">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-3 font-display text-3xl leading-none font-semibold tracking-tight sm:text-4xl ${tone === "warn" ? "text-red-700" : ""}`}>{value}</p>
      {hint ? <p className="mt-2 text-xs text-muted">{hint}</p> : null}
      {footer}
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
  gray: "bg-neutral-200 text-neutral-800",
  blue: "bg-sky-100 text-sky-900",
  amber: "bg-amber-100 text-amber-950",
  orange: "bg-orange-100 text-orange-950",
  violet: "bg-violet-100 text-violet-950",
  green: "bg-accent text-ink",
  teal: "bg-teal-100 text-teal-950",
  red: "bg-red-100 text-red-800",
} as const;

type Tone = keyof typeof TONES;

const STATUS_TONES: Record<string, Tone> = {
  new: "blue",
  contacted: "orange",
  quote_sent: "violet",
  booked: "teal",
  lost: "gray",
  reserved: "amber",
  confirmed: "green",
  shot: "blue",
  editing: "violet",
  delivered: "teal",
  cancelled: "red",
  todo: "gray",
  doing: "orange",
  done: "green",
  paid: "green",
  overdue: "red",
  due: "amber",
};

export function Badge({ tone = "gray", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${TONES[tone]}`}>
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
    <div className="mb-5 flex gap-1 overflow-x-auto text-sm">
      {items.map((item) => (
        <Link
          key={item.value}
          href={item.href}
          className={`rounded-full px-4 py-2 whitespace-nowrap no-underline ${
            item.value === active ? "bg-ink font-medium text-white" : "text-muted hover:bg-surface hover:text-ink"
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

export function ContactLinks({ phone, whatsappPhone }: { phone: string; whatsappPhone?: string | null }) {
  const number = normalizePhone(phone);
  const whatsapp = whatsappPhone ? normalizePhone(whatsappPhone) : null;
  return (
    <span className="inline-flex flex-col items-start gap-1">
      {number ? <a href={`tel:${number}`} className="py-1">{phone}</a> : <span>{phone}</span>}
      {whatsapp ? (
        <a href={`https://wa.me/${whatsapp.slice(1)}`} target="_blank" rel="noopener noreferrer" className="py-1 text-xs font-medium">
          WhatsApp · {whatsappPhone}
        </a>
      ) : null}
    </span>
  );
}

export function coupleName(one: string, two?: string | null) {
  return two ? `${one} & ${two}` : one;
}
