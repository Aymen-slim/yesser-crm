"use client";

import Link from "next/link";
import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { setLocale } from "@/lib/actions";
import type { Locale } from "@/lib/i18n";
import { isIsoDate, normalizePhone, type DashboardView } from "@/lib/constants";

export function PhoneInput({
  name,
  defaultValue,
  required = false,
  error,
}: {
  name: string;
  defaultValue?: string | null;
  required?: boolean;
  error: string;
}) {
  return (
    <input
      name={name}
      type="tel"
      inputMode="tel"
      autoComplete={name === "phone" ? "tel" : "off"}
      placeholder="+216 20123456 / +33 612345678"
      defaultValue={defaultValue ?? ""}
      required={required}
      maxLength={40}
      title={error}
      onInput={(event) => {
        const input = event.currentTarget;
        input.setCustomValidity(input.value.trim() && !normalizePhone(input.value) ? error : "");
      }}
      onBlur={(event) => {
        const input = event.currentTarget;
        const number = normalizePhone(input.value);
        if (number) input.value = number;
      }}
    />
  );
}

export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()}>
      {label}
    </button>
  );
}

export function DashboardPeriodField({ view, value, label }: { view: DashboardView; value: string; label: string }) {
  const router = useRouter();
  return (
    <div className="w-full min-w-0 md:w-44 md:shrink-0">
      <input
        type={view === "year" ? "number" : view === "day" ? "date" : "month"}
        inputMode={view === "year" ? "numeric" : undefined}
        aria-label={label}
        min={view === "year" ? 1970 : undefined}
        max={view === "year" ? 2100 : undefined}
        defaultValue={value}
        key={`${view}-${value}`}
        className="min-h-11"
        onChange={(event) => {
          const next = event.target.value;
          if (view === "year") {
            if (!/^[1-9]\d{3}$/.test(next)) return;
            const year = Number(next);
            if (year < 1970 || year > 2100) return;
            router.push(`/?view=year&period=${next}`);
            return;
          }
          if (view === "day") {
            if (!isIsoDate(next)) return;
            router.push(`/?view=day&period=${next}`);
            return;
          }
          if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(next)) return;
          router.push(`/?view=month&period=${next}`);
        }}
      />
    </div>
  );
}

export function MonthJump({ month, add, label }: { month: string; add: string | null; label: string }) {
  const router = useRouter();
  return (
    <input
      type="month"
      aria-label={label}
      defaultValue={month}
      key={month}
      className="min-h-11 min-w-0"
      onChange={(event) => {
        const value = event.target.value;
        if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(value)) return;
        const params = new URLSearchParams({ month: value });
        if (add && add.startsWith(`${value}-`)) params.set("add", add);
        router.push(`/calendar?${params}`);
      }}
    />
  );
}

export function OfferPackageFields({
  packages,
  packageId,
  price,
  labels,
}: {
  packages: { id: string; name: string; price_millimes: number }[];
  packageId: string;
  price: string;
  labels: { package: string; basePrice: string; none: string };
}) {
  const [selected, setSelected] = useState(packageId);
  const [amount, setAmount] = useState(price);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-muted">{labels.package}</span>
        <select
          name="package_id"
          value={selected}
          onChange={(event) => {
            const next = event.target.value;
            setSelected(next);
            const pack = packages.find((item) => item.id === next);
            setAmount(pack ? (pack.price_millimes / 1000).toFixed(3) : "");
          }}
        >
          <option value="">{labels.none}</option>
          {packages.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-muted">{labels.basePrice}</span>
        <input
          name="package_price"
          inputMode="decimal"
          placeholder="0.000"
          value={amount}
          disabled={!selected}
          onChange={(event) => setAmount(event.target.value)}
          required={Boolean(selected)}
        />
      </label>
    </div>
  );
}

export function ExtraPriceFields({
  extras,
  labels,
}: {
  extras: { id: string; name: string; price_millimes: number }[];
  labels: { extra: string; price: string; choose: string };
}) {
  const [selected, setSelected] = useState("");
  const [amount, setAmount] = useState("");

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-muted">{labels.extra}</span>
        <select
          name="extra_id"
          value={selected}
          required
          onChange={(event) => {
            const next = event.target.value;
            setSelected(next);
            const extra = extras.find((item) => item.id === next);
            setAmount(extra ? (extra.price_millimes / 1000).toFixed(3) : "");
          }}
        >
          <option value="">{labels.choose}</option>
          {extras.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-muted">{labels.price}</span>
        <input
          name="price"
          inputMode="decimal"
          placeholder="0.000"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          required
        />
      </label>
    </div>
  );
}

export function LineList({
  name,
  lines,
  addLabel,
  placeholder,
  removeLabel,
}: {
  name: string;
  lines: string[];
  addLabel: string;
  placeholder: string;
  removeLabel: string;
}) {
  const [rows, setRows] = useState(() =>
    (lines.length ? lines : [""]).map((value) => ({ key: crypto.randomUUID(), value })),
  );

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, index) => (
        <div key={row.key} className="flex items-center gap-2">
          <span className="w-4 shrink-0 text-center text-muted" aria-hidden>
            •
          </span>
          <span className="min-w-0 flex-1">
            <input
              name={name}
              value={row.value}
              placeholder={index === 0 ? placeholder : ""}
              aria-label={`${placeholder} ${index + 1}`}
              maxLength={160}
              onChange={(event) => {
                const value = event.target.value;
                setRows((current) => current.map((item) => (item.key === row.key ? { ...item, value } : item)));
              }}
            />
          </span>
          <button
            type="button"
            className="ghost"
            onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}
          >
            {removeLabel}
          </button>
        </div>
      ))}
      <div>
        <button
          type="button"
          className="ghost"
          disabled={rows.length >= 40}
          onClick={() => setRows((current) => [...current, { key: crypto.randomUUID(), value: "" }])}
        >
          {addLabel}
        </button>
      </div>
    </div>
  );
}

export function SubmitButton({
  children,
  pendingLabel = "…",
  className,
  form,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  form?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" form={form} disabled={pending} className={className} aria-busy={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}

export function ConfirmSubmit({
  children,
  message,
  className = "danger",
}: {
  children: React.ReactNode;
  message: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={className}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {pending ? "…" : children}
    </button>
  );
}

function LanguageSwitcherInner({
  locale,
  label,
  className = "",
}: {
  locale: Locale;
  label: string;
  className?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const returnTo = query ? `${pathname}?${query}` : pathname;

  return (
    <div
      className={`inline-flex rounded-full bg-track p-0.5 text-xs font-medium ${className}`}
      role="group"
      aria-label={label}
    >
      {(
        [
          { code: "en" as const, name: "EN" },
          { code: "fr" as const, name: "FR" },
        ] as const
      ).map(({ code, name }) => (
        <form key={code} action={setLocale}>
          <input type="hidden" name="locale" value={code} />
          <input type="hidden" name="return_to" value={returnTo} />
          <button
            type="submit"
            className={`rounded-full border-0 px-2.5 py-1 text-xs font-semibold shadow-none transition-colors ${
              locale === code ? "bg-ink text-white" : "bg-transparent text-muted hover:text-ink"
            }`}
            aria-pressed={locale === code}
          >
            {name}
          </button>
        </form>
      ))}
    </div>
  );
}

function LanguageSwitcherFallback({ className = "" }: { className?: string }) {
  return <div className={`inline-flex h-[30px] w-[72px] rounded-full bg-track ${className}`} aria-hidden />;
}

export function LanguageSwitcher(props: { locale: Locale; label: string; className?: string }) {
  return (
    <Suspense fallback={<LanguageSwitcherFallback className={props.className} />}>
      <LanguageSwitcherInner {...props} />
    </Suspense>
  );
}

function navClass(active: boolean) {
  const tone = active ? "bg-ink text-white" : "text-muted hover:bg-canvas hover:text-ink";
  return `flex w-full items-center rounded-full px-3.5 py-2.5 text-sm font-medium no-underline transition-colors ${tone}`;
}

function isNavActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/clients" && pathname.startsWith("/leads")) return true;
  return pathname === href || pathname.startsWith(`${href}/`);
}

const primaryHrefs: Record<string, string[]> = {
  admin: ["/", "/weddings", "/calendar", "/payments"],
  assistant: ["/weddings", "/calendar", "/clients", "/payments"],
  member: ["/", "/weddings", "/calendar"],
};

export function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-4">
      {items.map((link) => {
        const active = isNavActive(pathname, link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            prefetch={false}
            aria-current={active ? "page" : undefined}
            className={navClass(active)}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

function NavIcon({ name }: { name: string }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, className: "h-5 w-5", "aria-hidden": true } as const;
  if (name === "/") {
    return (
      <svg {...common}>
        <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" strokeLinejoin="round" />
      </svg>
    );
  }
  if (name === "/weddings") {
    return (
      <svg {...common}>
        <circle cx="9" cy="12" r="4" />
        <circle cx="15.5" cy="12" r="4" />
      </svg>
    );
  }
  if (name === "/calendar") {
    return (
      <svg {...common}>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M8 3.5v4M16 3.5v4M4 10h16" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "/payments") {
    return (
      <svg {...common}>
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <path d="M3 10h18" />
      </svg>
    );
  }
  if (name === "/clients") {
    return (
      <svg {...common}>
        <circle cx="9" cy="9" r="3" />
        <circle cx="16" cy="10" r="2.2" />
        <path d="M4.5 19c.4-2.6 2.2-4 4.5-4s4.1 1.4 4.5 4" strokeLinecap="round" />
        <path d="M14.5 19c.3-1.8 1.4-2.8 2.8-2.8 1.5 0 2.6 1 3 2.8" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="6" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function BottomNav({
  items,
  role,
  moreLabel,
  closeLabel,
  languageSwitcher,
  footer,
}: {
  items: { href: string; label: string }[];
  role: string;
  moreLabel: string;
  closeLabel: string;
  languageSwitcher: React.ReactNode;
  footer: React.ReactNode;
}) {
  const pathname = usePathname();
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === pathname;
  const primary = (primaryHrefs[role] ?? primaryHrefs.member)
    .map((href) => items.find((item) => item.href === href))
    .filter((item): item is { href: string; label: string } => Boolean(item));
  const moreItems = items.filter((item) => !primary.some((link) => link.href === item.href));
  const moreActive = moreItems.some((item) => isNavActive(pathname, item.href));

  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-40 bg-black/40 print:hidden md:hidden" onClick={() => setOpenedOn(null)} />
      ) : null}
      {open ? (
        <div
          id="studio-nav"
          className="fixed inset-x-3 z-50 max-h-[min(70vh,32rem)] overflow-y-auto rounded-3xl bg-surface p-3 shadow-[0_16px_40px_rgba(0,0,0,0.12)] print:hidden md:hidden"
          style={{ bottom: "calc(4rem + env(safe-area-inset-bottom))" }}
        >
          {moreItems.length > 0 ? (
            <nav className="flex flex-col gap-1">
              {moreItems.map((link) => {
                const active = isNavActive(pathname, link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    prefetch={false}
                    aria-current={active ? "page" : undefined}
                    className={navClass(active)}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          ) : null}
          <div className={moreItems.length > 0 ? "mt-3 border-t border-line pt-3" : undefined}>
            {languageSwitcher}
            {footer}
          </div>
        </div>
      ) : null}
      <nav className="fixed inset-x-0 bottom-0 z-50 grid border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] print:hidden md:hidden" style={{ gridTemplateColumns: `repeat(${primary.length + 1}, minmax(0, 1fr))` }}>
        {primary.map((link) => {
          const active = isNavActive(pathname, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              prefetch={false}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-16 flex-col items-center justify-center gap-1 px-1 py-2 text-center text-[10px] leading-tight font-medium no-underline ${active ? "text-ink" : "text-muted"}`}
            >
              <span className={`flex h-7 w-7 items-center justify-center rounded-full ${active ? "bg-accent text-ink" : ""}`}>
                <NavIcon name={link.href} />
              </span>
              {link.label}
            </Link>
          );
        })}
        <button
          type="button"
          className="nav-tab"
          aria-expanded={open}
          aria-controls="studio-nav"
          data-current={moreActive ? "page" : undefined}
          onClick={() => setOpenedOn(open ? null : pathname)}
        >
          <span className={`flex h-7 w-7 items-center justify-center rounded-full ${open || moreActive ? "bg-accent text-ink" : ""}`}>
            <NavIcon name="more" />
          </span>
          {open ? closeLabel : moreLabel}
        </button>
      </nav>
    </>
  );
}
