import { LanguageSwitcher, SubmitButton } from "@/components/client";
import { Banner, Card, Field, LogoMark } from "@/components/ui";
import { signIn } from "@/lib/actions";
import { supabaseConfigured } from "@/lib/auth";
import { getMessages } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";

export async function generateMetadata() {
  return { title: getMessages(await getLocale()).auth.signIn };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const ready = supabaseConfigured();
  const locale = await getLocale();
  const messages = getMessages(locale);
  return (
    <main className="relative flex min-h-screen items-center justify-center px-6 py-12">
      <div className="absolute top-4 right-4 md:top-6 md:right-6">
        <LanguageSwitcher locale={locale} label={messages.ui.language} />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoMark className="h-14 w-14 rounded-[1.25rem]" />
          <p className="mt-4 font-display text-3xl font-semibold tracking-tight">Yesser</p>
          <p className="mt-1 text-xs tracking-[0.18em] text-muted uppercase">{messages.brandTagline}</p>
        </div>
        <Card className="p-6">
          <h1 className="mb-5 text-lg font-semibold">{messages.auth.signIn}</h1>
          <Banner error={error} />
          {ready ? (
            <form action={signIn} className="flex flex-col gap-4">
              <Field label={messages.auth.email}>
                <input name="email" type="email" autoComplete="username" required />
              </Field>
              <Field label={messages.auth.password}>
                <input name="password" type="password" autoComplete="current-password" required />
              </Field>
              <SubmitButton className="mt-2 w-full" pendingLabel={messages.auth.signingIn}>
                {messages.auth.signIn}
              </SubmitButton>
            </form>
          ) : (
            <p className="text-sm text-muted">{messages.auth.setupHint}</p>
          )}
        </Card>
      </div>
    </main>
  );
}
