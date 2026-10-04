import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton, SubmitButton } from "@/components/client";
import { ContractResetButton, YesserContract } from "@/components/yesser-contract";
import { Banner, coupleName } from "@/components/ui";
import { resetContract, saveContract } from "@/lib/actions";
import { requireAdmin } from "@/lib/auth";
import { encodeSchedule, formatDt, guessPack, packFields, readContractBlanks, type ContractBlanks, type ScheduleRow } from "@/lib/contract";
import { one } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  return { title: "Contrat" };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function WeddingContractPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const { error, notice } = await searchParams;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const [weddingResult, extras, places, days, payments, saved] = await Promise.all([
    supabase
      .from("weddings")
      .select(
        "id, wedding_date, start_time, venue_name, city, governorate, total_millimes, features, clients(partner_one_name, partner_two_name, phone, email, city), packages(name, features)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("wedding_extras").select("name").eq("wedding_id", id).order("created_at"),
    supabase.from("wedding_locations").select("label, venue_name, city").eq("wedding_id", id).order("created_at"),
    supabase.from("wedding_days").select("day_date, start_time, label").eq("wedding_id", id).order("day_date"),
    supabase.from("payments").select("label, amount_millimes, due_date").eq("wedding_id", id).order("due_date", { nullsFirst: false }),
    supabase.from("contracts").select("fields, updated_at").eq("wedding_id", id).maybeSingle(),
  ]);

  const wedding = weddingResult.data;
  if (!wedding) notFound();

  const client = one(wedding.clients);
  const pack = one(wedding.packages);
  const place = [wedding.venue_name, wedding.city, wedding.governorate].filter(Boolean).join(", ");
  const otherPlaces = (places.data ?? [])
    .map((spot) => [spot.label, spot.venue_name, spot.city].filter(Boolean).join(", "))
    .filter(Boolean);
  const scheduleRows: ScheduleRow[] = [{ date: frenchLongDate(wedding.wedding_date), place }];
  for (const day of days.data ?? []) {
    if (day.day_date === wedding.wedding_date) continue;
    const label = [day.label, day.start_time ? day.start_time.slice(0, 5) : ""].filter(Boolean).join(" · ");
    scheduleRows.push({ date: [frenchLongDate(day.day_date), label].filter(Boolean).join(" — "), place: "" });
  }
  for (const spot of otherPlaces) scheduleRows.push({ date: "", place: spot });
  const packs = packFields();
  const chosen = guessPack(pack?.name);
  const features = (Array.isArray(wedding.features) && wedding.features.length > 0 ? wedding.features : pack?.features) as unknown;
  const featureLines = Array.isArray(features) ? features.filter((line): line is string => typeof line === "string" && line.trim() !== "") : [];
  if (chosen === "1" || chosen === "2" || chosen === "3") {
    if (featureLines.length > 0) packs[`pack${chosen}_lines`] = featureLines.join("\n").slice(0, 1500);
    packs[`pack${chosen}_price`] = `${formatDt(wedding.total_millimes)} DT`;
  }
  const paymentLines = payments.data ?? [];
  const depositLine = paymentLines.find((payment) => /acompte|arrhes|dépôt|depot|avance/i.test(payment.label)) ?? paymentLines[0];
  const depositMillimes = depositLine?.amount_millimes ?? null;
  const defaults: ContractBlanks = {
    client_names: client ? coupleName(client.partner_one_name, client.partner_two_name) : "",
    contact: [client?.phone, client?.email].filter(Boolean).join(" / "),
    address: client?.city || wedding.city || "",
    event_date: scheduleRows.map((row) => row.date).filter(Boolean).join(" · "),
    places: scheduleRows.map((row) => row.place).filter(Boolean).join(" · "),
    schedule: encodeSchedule(scheduleRows),
    ...packs,
    start_time: wedding.start_time ? wedding.start_time.slice(0, 5) : "",
    end_time: "",
    preparations: "",
    pack: guessPack(pack?.name),
    extras: (extras.data ?? []).map((line) => line.name).join(" · "),
    total: formatDt(wedding.total_millimes),
    deposit: depositMillimes == null ? "" : formatDt(depositMillimes),
    balance: formatDt(Math.max(0, wedding.total_millimes - (depositMillimes ?? 0))),
    signed_place: "",
    signed_day: "",
    signed_month: "",
  };
  const fields = saved.data ? readContractBlanks(saved.data.fields, defaults) : defaults;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/weddings/${id}`} className="text-sm text-muted no-underline">
          Retour au mariage
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton form="yesser-contract">Enregistrer</SubmitButton>
          <form action={resetContract}>
            <input type="hidden" name="wedding_id" value={id} />
            <ContractResetButton label="Reprendre le mariage" message="Effacer vos modifications et reprendre les informations du mariage ?" />
          </form>
          <PrintButton label="Télécharger le PDF" />
        </div>
      </div>
      <div className="print:hidden">
        <Banner error={error} notice={notice} />
        <p className="mb-6 text-sm text-muted">
          Le texte juridique reste celui du modèle. Les dates, les lieux, le forfait, les prestations et le tarif se modifient directement ici, puis enregistrez.
          Pour un PDF sans adresse du site, désactivez « En-têtes et pieds de page » dans les options d’impression si votre navigateur les ajoute.
        </p>
      </div>
      <YesserContract key={`${saved.data?.updated_at ?? "default"}:${notice ?? ""}`} weddingId={id} initial={fields} saveAction={saveContract} />
    </div>
  );
}

function frenchLongDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return "";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}
