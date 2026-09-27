import { Shell } from "@/components/shell";
import { requireUser } from "@/lib/auth";
import { getMessages } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";

export const dynamic = "force-dynamic";

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireUser();
  const locale = await getLocale();
  const messages = getMessages(locale);
  return (
    <Shell profile={profile} locale={locale} messages={messages}>
      {children}
    </Shell>
  );
}
