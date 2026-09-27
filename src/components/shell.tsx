import { NavLinks, LanguageSwitcher } from "@/components/client";
import { signOut } from "@/lib/actions";
import type { Profile } from "@/lib/auth";
import type { Locale, Messages } from "@/lib/i18n";

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
  const languageSwitcher = (
    <LanguageSwitcher locale={locale} label={messages.ui.language} />
  );
  const signOutForm = (
    <form action={signOut}>
      <button className="ghost w-full" type="submit">
        {messages.auth.signOut}
      </button>
    </form>
  );
  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <aside className="relative border-b border-line bg-surface print:hidden md:sticky md:top-0 md:flex md:h-screen md:flex-col md:border-r md:border-b-0">
        <div className="flex items-start justify-between gap-3 px-6 py-5 md:py-7">
          <div>
            <p className="font-display text-xl">Yesser</p>
            <p className="text-xs tracking-[0.18em] text-muted uppercase">{messages.brandTagline}</p>
          </div>
          <div className="hidden shrink-0 md:block">{languageSwitcher}</div>
        </div>
        <NavLinks
          items={items}
          mobileFooter={signOutForm}
          menuLabel={messages.ui.menu}
          closeLabel={messages.ui.close}
          languageSwitcher={languageSwitcher}
        />
        <div className="mt-auto hidden border-t border-line px-6 py-4 md:block">
          <p className="truncate text-sm font-medium">{profile.full_name}</p>
          <p className="mb-3 text-xs text-muted">{messages.terms[profile.role]}</p>
          {signOutForm}
        </div>
      </aside>
      <main className="mx-auto w-full max-w-6xl px-5 py-8 md:px-10 md:py-10 print:max-w-none print:px-0 print:py-0">{children}</main>
    </div>
  );
}
