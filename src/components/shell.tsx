import { NavLinks, LanguageSwitcher } from "@/components/client";
import { LogoMark } from "@/components/ui";
import { signOut } from "@/lib/actions";
import type { Profile } from "@/lib/auth";
import type { Locale, Messages } from "@/lib/i18n";
import Link from "next/link";

const linkKeys = [
  { href: "/", key: "dashboard" as const },
  { href: "/clients", key: "couples" as const, admin: true },
  { href: "/weddings", key: "weddings" as const },
  { href: "/calendar", key: "calendar" as const },
  { href: "/payments", key: "payments" as const, admin: true },
  { href: "/expenses", key: "expenses" as const, admin: true },
  { href: "/packages", key: "packages" as const, admin: true },
  { href: "/team", key: "team" as const, admin: true },
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  const letters = parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
  return letters || "Y";
}

export function Shell({
  profile,
  locale,
  messages,
  children,
}: {
  profile: Profile;
  locale: Locale;
  messages: Messages;
  children: React.ReactNode;
}) {
  const items = linkKeys
    .filter((link) => !link.admin || profile.role === "admin")
    .map(({ href, key }) => ({ href, label: messages.nav[key] }));
  const languageSwitcher = () => <LanguageSwitcher locale={locale} label={messages.ui.language} />;
  const signOutButton = (className: string, fullWidth = false) => (
    <form action={signOut} className={fullWidth ? "w-full" : undefined}>
      <button className={className} type="submit">
        {messages.auth.signOut}
      </button>
    </form>
  );

  return (
    <div className="min-h-screen md:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col self-start border-r border-line bg-surface print:hidden md:flex">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 px-5 py-5 no-underline">
          <LogoMark />
          <span className="text-[15px] font-semibold tracking-tight">Yesser</span>
        </Link>
        <NavLinks items={items} layout="sidebar" />
        <div className="mt-auto border-t border-line p-4">
          <div className="mb-4">{languageSwitcher()}</div>
          <div className="mb-3 flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">
              {initials(profile.full_name)}
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold">{profile.full_name}</p>
              <p className="truncate text-xs text-muted">{messages.terms[profile.role]}</p>
            </div>
          </div>
          {signOutButton("ghost w-full", true)}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 print:hidden md:hidden">
          <div className="relative border-b border-line bg-surface">
            <div className="flex items-center gap-3 px-5 py-3">
              <Link href="/" className="flex shrink-0 items-center gap-2.5 no-underline">
                <LogoMark />
                <span className="text-[15px] font-semibold tracking-tight">Yesser</span>
              </Link>
              <NavLinks
                items={items}
                menuLabel={messages.ui.menu}
                closeLabel={messages.ui.close}
                languageSwitcher={languageSwitcher()}
                mobileFooter={
                  <div className="mt-3 border-t border-line pt-3">
                    <p className="truncate text-sm font-semibold">{profile.full_name}</p>
                    <p className="mb-3 text-xs text-muted">{messages.terms[profile.role]}</p>
                    {signOutButton("ghost w-full", true)}
                  </div>
                }
              />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-8 md:px-8 md:py-10 print:max-w-none print:px-0 print:py-0">{children}</main>
      </div>
    </div>
  );
}
