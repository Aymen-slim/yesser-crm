import Link from "next/link";
import { getMessages } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";

export default async function StudioNotFound() {
  const messages = getMessages(await getLocale());
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="font-display text-3xl">{messages.missing.title}</p>
      <p className="mt-3 text-sm text-muted">{messages.missing.body}</p>
      <Link href="/" className="button mt-6 no-underline">
        {messages.missing.back}
      </Link>
    </div>
  );
}
