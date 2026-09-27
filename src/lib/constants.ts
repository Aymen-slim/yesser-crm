export const GOVERNORATES = [
  "Tunis",
  "Ariana",
  "Ben Arous",
  "Manouba",
  "Nabeul",
  "Zaghouan",
  "Bizerte",
  "Béja",
  "Jendouba",
  "Le Kef",
  "Siliana",
  "Sousse",
  "Monastir",
  "Mahdia",
  "Sfax",
  "Kairouan",
  "Kasserine",
  "Sidi Bouzid",
  "Gabès",
  "Medenine",
  "Tataouine",
  "Gafsa",
  "Tozeur",
  "Kebili",
] as const;

export const LEAD_SOURCES = [
  "instagram",
  "facebook",
  "whatsapp",
  "referral",
  "phone",
  "other",
] as const;

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "quote_sent",
  "booked",
  "lost",
] as const;

export const WEDDING_STATUSES = [
  "reserved",
  "confirmed",
  "shot",
  "editing",
  "delivered",
  "cancelled",
] as const;

export const PAYMENT_METHODS = ["cash", "bank_transfer", "other"] as const;

export const TASK_STATUSES = ["todo", "doing", "done"] as const;

export const PAGE_SIZE = 20;

export function labelize(value: string): string {
  const text = value.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function one<T>(value: T | T[] | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

export function daysAgoInTunis(days: number): string {
  const [year, month, day] = todayInTunis().split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - days)).toISOString().slice(0, 10);
}

export function todayInTunis(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Tunis",
  }).format(new Date());
}

export function formatDate(value: string | null | undefined, locale: "en" | "fr" = "en"): string {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function last12Months(locale: "en" | "fr" = "en") {
  const stamp = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Tunis",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
  const year = Number(stamp.slice(0, 4));
  const month = Number(stamp.slice(5, 7));
  const months = [];
  for (let i = 11; i >= 0; i -= 1) {
    let y = year;
    let m = month - i;
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    const key = `${y}-${String(m).padStart(2, "0")}`;
    const label = new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", { month: "short", timeZone: "UTC" }).format(
      new Date(Date.UTC(y, m - 1, 1)),
    );
    months.push({ key, label, year: y, month: m });
  }
  return months;
}

export function monthRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { start, end, days };
}
