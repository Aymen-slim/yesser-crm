import Link from "next/link";
import { getMessages } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";

export default async function NotFound() {
  const messages = getMessages(await getLocale());
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="font-display text-4xl font-semibold tracking-tight">{messages.missing.pageTitle}</p>
      <p className="mt-3 text-sm text-muted">{messages.missing.pageBody}</p>
      <Link href="/" className="button mt-6 no-underline">
        {messages.missing.go}
      </Link>
    </main>
  );
}
