"use client";

import { useEffect, useState } from "react";
import { fill, getMessages, isLocale, type Locale } from "@/lib/i18n";

export default function StudioError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const [locale, setLocale] = useState<Locale>("en");
  useEffect(() => {
    console.error(error);
    const lang = document.documentElement.lang;
    if (isLocale(lang)) setLocale(lang);
  }, [error]);
  const messages = getMessages(locale);

  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="font-display text-3xl">{messages.errors.title}</p>
      <p className="mt-3 text-sm text-muted">
        {messages.errors.body}
        {error.digest ? <span className="mt-1 block text-xs">{fill(messages.errors.reference, { digest: error.digest })}</span> : null}
      </p>
      <button type="button" className="mt-6" onClick={() => retry()}>
        {messages.errors.retry}
      </button>
    </div>
  );
}
