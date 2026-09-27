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

export function SubmitButton({
  children,
  pendingLabel = "…",
  className,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className} aria-busy={pending}>
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

const ICONS: Record<string, string> = {
  "/": "M3 12l9-8 9 8M5 10v10h14V10",
  "/clients": "M16 19v-1a4 4 0 00-8 0v1M12 11a3 3 0 100-6 3 3 0 000 6z",
  "/weddings": "M12 20s-7-4.5-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.5-7 10-7 10z",
  "/packages": "M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8",
  "/calendar": "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  "/payments": "M3 7h18v10H3zM3 11h18M7 15h3",
  "/expenses": "M12 3v18M17 7H9.5a2.5 2.5 0 000 5h5a2.5 2.5 0 010 5H6",
  "/team": "M9 11a3 3 0 100-6 3 3 0 000 6zM3 19v-1a5 5 0 0110 0v1M16 11a3 3 0 100-6M21 19v-1a5 5 0 00-4-4.9",
};

function Icon({ href }: { href: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICONS[href]} />
    </svg>
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
      className={`inline-flex rounded-lg border border-line bg-surface p-0.5 text-xs font-medium ${className}`}
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
            className={`rounded-md px-2.5 py-1 transition-colors ${
              locale === code ? "bg-ink text-white" : "text-muted hover:text-ink"
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
  return <div className={`inline-flex h-[30px] w-[72px] rounded-lg border border-line bg-surface ${className}`} aria-hidden />;
}

export function LanguageSwitcher(props: { locale: Locale; label: string; className?: string }) {
  return (
    <Suspense fallback={<LanguageSwitcherFallback className={props.className} />}>
      <LanguageSwitcherInner {...props} />
    </Suspense>
  );
}

export function NavLinks({
  items,
  mobileFooter,
  menuLabel,
  closeLabel,
  languageSwitcher,
}: {
  items: { href: string; label: string }[];
  mobileFooter?: React.ReactNode;
  menuLabel: string;
  closeLabel: string;
  languageSwitcher?: React.ReactNode;
}) {
  const pathname = usePathname();
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === pathname;

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href === "/clients" && pathname.startsWith("/leads")) return true;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <>
      <div className="absolute top-4 right-4 flex items-center gap-2 md:hidden">
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
      <nav id="studio-nav" className={`${open ? "flex" : "hidden"} flex-col gap-0.5 px-3 pb-4 md:flex`}>
        {items.map((link) => {
          const active = isActive(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              prefetch={false}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm no-underline transition-colors ${
                active ? "bg-ink text-white" : "text-stone-600 hover:bg-canvas hover:text-ink"
              }`}
            >
              <Icon href={link.href} />
              {link.label}
            </Link>
          );
        })}
        {mobileFooter ? <div className="mt-3 border-t border-line pt-3 md:hidden">{mobileFooter}</div> : null}
      </nav>
    </>
  );
}
