"use client";

import { useEffect, useSyncExternalStore } from "react";
import { fill, getMessages, isLocale, type Locale } from "@/lib/i18n";

function subscribeLocale(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  return () => observer.disconnect();
}

function localeSnapshot(): Locale {
  const lang = document.documentElement.lang;
  return isLocale(lang) ? lang : "en";
}

export default function StudioError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const locale = useSyncExternalStore(subscribeLocale, localeSnapshot, () => "en" as const);
  useEffect(() => {
    console.error(error);
  }, [error]);
  const messages = getMessages(locale);

  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="font-display text-3xl font-semibold tracking-tight">{messages.errors.title}</p>
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
