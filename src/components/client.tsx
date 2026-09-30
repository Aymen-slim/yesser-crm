"use client";

import Link from "next/link";
import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { setLocale } from "@/lib/actions";
import type { Locale } from "@/lib/i18n";

export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()}>
      {label}
    </button>
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
      className="w-40"
      onChange={(event) => {
        const value = event.target.value;
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return;
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

export function NavLinks({
  items,
  mobileFooter,
  menuLabel,
  closeLabel,
  languageSwitcher,
  layout = "mobile",
}: {
  items: { href: string; label: string }[];
  mobileFooter?: React.ReactNode;
  menuLabel?: string;
  closeLabel?: string;
  languageSwitcher?: React.ReactNode;
  layout?: "sidebar" | "mobile";
}) {
  const pathname = usePathname();
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === pathname;

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href === "/clients" && pathname.startsWith("/leads")) return true;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const links = items.map((link) => {
    const active = isActive(link.href);
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
  });

  if (layout === "sidebar") {
    return (
      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-4">{links}</nav>
    );
  }

  return (
    <>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {languageSwitcher}
        <button
          type="button"
          className="ghost"
          aria-expanded={open}
          aria-controls="studio-nav"
          onClick={() => setOpenedOn(open ? null : pathname)}
        >
          {open ? closeLabel : menuLabel}
        </button>
      </div>
      {open ? (
        <nav id="studio-nav" className="absolute inset-x-0 top-full z-30 flex flex-col gap-1 border-b border-line bg-surface px-4 py-3">
          {links}
          {mobileFooter}
        </nav>
      ) : null}
    </>
  );
}
