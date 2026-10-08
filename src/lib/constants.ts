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

export function normalizePhone(value: string): string | null {
  const text = value.trim();
  if (text.length > 40 || !/^\+?[0-9\s().-]+$/.test(text)) return null;
  let number = text.replace(/[\s().-]/g, "");
  if (number.startsWith("00")) number = `+${number.slice(2)}`;
  if (/^[2-9]\d{7}$/.test(number)) number = `+216${number}`;
  if (/^216[2-9]\d{7}$/.test(number)) number = `+${number}`;
  if (!/^\+[1-9]\d{6,14}$/.test(number)) return null;
  if (number.startsWith("+216") && !/^\+216[2-9]\d{7}$/.test(number)) return null;
  return number;
}

export function phoneSearchDigits(value: string | undefined) {
  return (value ?? "").replace(/\D/g, "").slice(0, 20);
}

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

export function calendarYear(year: number, locale: "en" | "fr" = "en") {
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const label = new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", { month: "short", timeZone: "UTC" }).format(
      new Date(Date.UTC(year, month - 1, 1)),
    );
    return { key, label, year, month };
  });
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

export function isIsoDate(value: string): boolean {
  if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { start, end, days };
}

export function shiftIsoDate(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export type DashboardView = "month" | "year" | "day";

export type DashboardPeriod = {
  view: DashboardView;
  key: string;
  label: string;
  start: string;
  end: string;
  prev: string;
  next: string;
  isCurrent: boolean;
  year: number;
  month: number;
  days: number;
};

const YEAR_MIN = 1970;
const YEAR_MAX = 2100;

function yearInRange(year: number) {
  return year >= YEAR_MIN && year <= YEAR_MAX;
}

export function resolveDashboardPeriod(
  view: string | undefined,
  period: string | undefined,
  today: string,
  locale: "en" | "fr" = "en",
): DashboardPeriod {
  const mode: DashboardView = view === "year" || view === "day" ? view : "month";
  const currentYear = Number(today.slice(0, 4));
  const currentMonth = today.slice(0, 7);
  const dateLocale = locale === "fr" ? "fr-FR" : "en-GB";

  if (mode === "year") {
    const parsed = period && /^[1-9]\d{3}$/.test(period) ? Number(period) : currentYear;
    const year = yearInRange(parsed) ? parsed : currentYear;
    return {
      view: mode,
      key: String(year),
      label: String(year),
      start: `${year}-01-01`,
      end: `${year + 1}-01-01`,
      prev: String(year - 1),
      next: String(year + 1),
      isCurrent: year === currentYear,
      year,
      month: 1,
      days: 0,
    };
  }

  if (mode === "day") {
    const key = period && isIsoDate(period) && yearInRange(Number(period.slice(0, 4))) ? period : today;
    return {
      view: mode,
      key,
      label: formatDate(key, locale),
      start: key,
      end: shiftIsoDate(key, 1),
      prev: shiftIsoDate(key, -1),
      next: shiftIsoDate(key, 1),
      isCurrent: key === today,
      year: Number(key.slice(0, 4)),
      month: Number(key.slice(5, 7)),
      days: 1,
    };
  }

  const key = period && /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(period) && yearInRange(Number(period.slice(0, 4))) ? period : currentMonth;
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const range = monthRange(year, month);
  const prev = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
  const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
  const label = new Intl.DateTimeFormat(dateLocale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
  return {
    view: mode,
    key,
    label,
    start: range.start,
    end: range.end,
    prev,
    next,
    isCurrent: key === currentMonth,
    year,
    month,
    days: range.days,
  };
}

export function dashboardPeriodInRange(view: DashboardView, value: string) {
  const year = Number(value.slice(0, 4));
  return yearInRange(year);
}

export type WeddingDateSort = "nearest" | "farthest" | "oldest";

export function sortByWeddingDate<T extends { id: string; wedding_date: string }>(rows: T[], sort: WeddingDateSort, today: string) {
  return [...rows].sort((a, b) => {
    if (sort === "oldest") return a.wedding_date.localeCompare(b.wedding_date) || a.id.localeCompare(b.id);
    if (sort === "farthest") return b.wedding_date.localeCompare(a.wedding_date) || a.id.localeCompare(b.id);
    const aUpcoming = a.wedding_date >= today;
    const bUpcoming = b.wedding_date >= today;
    if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
    if (aUpcoming) return a.wedding_date.localeCompare(b.wedding_date) || a.id.localeCompare(b.id);
    return b.wedding_date.localeCompare(a.wedding_date) || a.id.localeCompare(b.id);
  });
}
