import Link from "next/link";
import { PackageForm } from "@/components/record-forms";
import { Badge, Banner, Card, Disclosure, EmptyState, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { fill, getMessages } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { formatTnd } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  return { title: getMessages(await getLocale()).nav.packages };
}

export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  await requireAdmin();
  const messages = getMessages(await getLocale());
  const { error, notice } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase
    .from("packages")
    .select("id, name, description, price_millimes, coverage_hours, photo_count, includes_album, includes_video, includes_drone, active")
    .order("active", { ascending: false })
    .order("price_millimes");

  return (
    <div>
      <PageHeader title={messages.packages.title} subtitle={messages.packages.subtitle} />
      <Banner error={error} notice={notice} />
      <Disclosure label={messages.packages.newPackage} open={Boolean(error)}>
        <PackageForm />
      </Disclosure>
      {(data ?? []).length === 0 ? (
        <Card>
          <EmptyState>{messages.packages.empty}</EmptyState>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(data ?? []).map((item) => {
            const extras = [
              item.includes_album && messages.terms.album,
              item.includes_video && messages.terms.video,
              item.includes_drone && messages.terms.drone,
            ].filter(Boolean) as string[];
            return (
              <Link key={item.id} href={`/packages/${item.id}`} className="no-underline">
                <Card className={`flex h-full flex-col p-5 transition-colors hover:border-stone-300 ${item.active ? "" : "opacity-60"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-display text-xl">{item.name}</h2>
                    {item.active ? null : <Badge>{messages.packages.hidden}</Badge>}
                  </div>
                  <p className="mt-1 font-medium">{formatTnd(item.price_millimes)}</p>
                  {item.description ? <p className="mt-3 line-clamp-3 text-sm text-muted">{item.description}</p> : null}
                  <p className="mt-auto pt-4 text-xs text-muted">
                    {fill(messages.packages.coverage, { hours: item.coverage_hours, count: item.photo_count })}
                  </p>
                  {extras.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {extras.map((extra) => (
                        <Badge key={extra} tone="amber">
                          {extra}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
