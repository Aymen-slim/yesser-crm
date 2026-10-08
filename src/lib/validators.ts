import { z } from "zod";
import {
  GOVERNORATES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  PAYMENT_METHODS,
  TASK_STATUSES,
  WEDDING_STATUSES,
  normalizePhone,
  isIsoDate,
} from "@/lib/constants";
import { tndToMillimes } from "@/lib/money";

const phone = z
  .string()
  .trim()
  .refine((value) => normalizePhone(value) !== null, "err_phone")
  .transform((value) => normalizePhone(value) ?? value);

const optionalPhone = phone.or(z.string().trim().length(0, "err_phone")).default("");

const optionalEmail = z
  .string()
  .trim()
  .email("err_email")
  .or(z.literal(""))
  .optional();

const optionalUrl = z
  .string()
  .trim()
  .max(2000)
  .default("")
  .refine((value) => value === "" || /^https?:\/\/\S+$/i.test(value), "err_url");

const optionalTime = z
  .string()
  .trim()
  .default("")
  .transform((value, ctx) => {
    if (!value) return "";
    const match = /^(\d{2}:\d{2})(?::\d{2})?$/.exec(value);
    if (!match) {
      ctx.addIssue({ code: "custom", message: "err_form" });
      return z.NEVER;
    }
    return match[1];
  });

const flag = z
  .string()
  .optional()
  .transform((value) => value === "true" || value === "on");

const money = z.string().trim().transform((value, ctx) => {
  try {
    return tndToMillimes(value);
  } catch (error) {
    ctx.addIssue({
      code: "custom",
      message: error instanceof Error ? error.message : "err_amount",
    });
    return z.NEVER;
  }
});

const optionalMoney = z
  .string()
  .trim()
  .default("")
  .transform((value, ctx) => {
    if (!value) return null;
    try {
      return tndToMillimes(value);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "err_amount",
      });
      return z.NEVER;
    }
  });

const instagram = z
  .string()
  .trim()
  .max(60)
  .default("")
  .transform((value) => value.replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/.*$/, ""));

export const quickBookSchema = z.object({
  partner_one_name: z.string().trim().min(1, "err_partner"),
  partner_two_name: z.string().trim().default(""),
  phone,
  whatsapp_phone: optionalPhone,
  wedding_date: z.string().trim().refine(isIsoDate, "err_date"),
  venue_name: z.string().trim().default(""),
  total: optionalMoney,
});

export const leadSchema = z.object({
  partner_one_name: z.string().trim().min(1, "err_partner"),
  partner_two_name: z.string().trim().default(""),
  phone,
  whatsapp_phone: optionalPhone,
  email: optionalEmail,
  source: z.enum(LEAD_SOURCES),
  city: z.string().trim().default(""),
  venue: z.string().trim().default(""),
  wedding_date: z
    .string()
    .trim()
    .default("")
    .refine((value) => value === "" || isIsoDate(value), "err_date"),
  status: z.enum(LEAD_STATUSES),
  package_id: z.string().uuid().or(z.literal("")).default(""),
});

export const clientSchema = z.object({
  partner_one_name: z.string().trim().min(1, "err_partner"),
  partner_two_name: z.string().trim().default(""),
  phone,
  whatsapp_phone: optionalPhone,
  email: optionalEmail,
  city: z.string().trim().default(""),
});

export const packageSchema = z.object({
  name: z.string().trim().min(1, "err_name"),
  description: z.string().trim().default(""),
  price: money,
  coverage_hours: z.coerce.number().min(0).max(48),
  photo_count: z.coerce.number().int().min(0).max(10000),
  includes_album: flag,
  includes_video: flag,
  includes_drone: flag,
  active: flag,
});

export const extraSchema = z.object({
  name: z.string().trim().min(1, "err_name").max(80),
  price: money,
  active: flag,
});

export const offerSchema = z
  .object({
    wedding_id: z.string().uuid(),
    package_id: z.string().uuid().or(z.literal("")).default(""),
    package_price: optionalMoney,
  })
  .refine((data) => !data.package_id || data.package_price != null, { message: "err_amount" });

export const weddingExtraSchema = z.object({
  wedding_id: z.string().uuid(),
  extra_id: z.string().uuid("err_extra"),
  price: money,
});

export const weddingExtraPriceSchema = z.object({
  id: z.string().uuid(),
  wedding_id: z.string().uuid(),
  price: money,
});

export const weddingDaySchema = z.object({
  wedding_id: z.string().uuid(),
  day_date: z.string().trim().refine(isIsoDate, "err_date"),
  start_time: optionalTime,
  label: z.string().trim().max(80, "err_form").default(""),
});

export const weddingPlaceSchema = z
  .object({
    wedding_id: z.string().uuid(),
    label: z.string().trim().max(80).default(""),
    venue_name: z.string().trim().max(120).default(""),
    city: z.string().trim().max(80).default(""),
    location_url: optionalUrl,
  })
  .refine((data) => data.venue_name || data.city || data.location_url, { message: "err_place" });

const SCHEDULE_LIMIT = 12;

const extraDayRow = z.object({
  day_date: z.string().trim().refine(isIsoDate, "err_date"),
  start_time: optionalTime,
  label: z.string().trim().max(80, "err_form"),
});

const extraPlaceRow = z
  .object({
    label: z.string().trim().max(80, "err_form"),
    venue_name: z.string().trim().max(120, "err_form"),
    city: z.string().trim().max(80, "err_form"),
    location_url: optionalUrl,
  })
  .refine((data) => data.venue_name || data.city || data.location_url, { message: "err_place" });

export type ExtraDay = z.infer<typeof extraDayRow>;
export type ExtraPlace = z.infer<typeof extraPlaceRow>;

function formStrings(formData: FormData, name: string) {
  return formData.getAll(name).flatMap((value) => (typeof value === "string" ? [value] : []));
}

function tooLong(values: string[], max: number) {
  return values.some((value) => value.length > max);
}

export function parseWeddingExtras(
  formData: FormData,
  mainDate: string,
): { days: ExtraDay[]; places: ExtraPlace[] } | { error: string } {
  const dates = formStrings(formData, "extra_day_date");
  const times = formStrings(formData, "extra_day_time");
  const dayLabels = formStrings(formData, "extra_day_label");
  const dayCount = Math.max(dates.length, times.length, dayLabels.length);
  if (dayCount > SCHEDULE_LIMIT || tooLong(dates, 40) || tooLong(times, 12) || tooLong(dayLabels, 80)) {
    return { error: "err_form" };
  }

  const days: ExtraDay[] = [];
  const seen = new Set<string>();
  if (isIsoDate(mainDate)) seen.add(mainDate);
  for (let index = 0; index < dayCount; index += 1) {
    const dayDate = (dates[index] ?? "").trim();
    const startTime = (times[index] ?? "").trim();
    const label = (dayLabels[index] ?? "").trim();
    if (!dayDate && !startTime && !label) continue;
    const parsed = extraDayRow.safeParse({ day_date: dayDate, start_time: startTime, label });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "err_form" };
    if (parsed.data.day_date === mainDate) return { error: "day_is_main" };
    if (seen.has(parsed.data.day_date)) return { error: "day_exists" };
    seen.add(parsed.data.day_date);
    days.push(parsed.data);
  }

  const placeLabels = formStrings(formData, "extra_place_label");
  const venues = formStrings(formData, "extra_place_venue");
  const cities = formStrings(formData, "extra_place_city");
  const urls = formStrings(formData, "extra_place_url");
  const placeCount = Math.max(placeLabels.length, venues.length, cities.length, urls.length);
  if (placeCount > SCHEDULE_LIMIT || tooLong(placeLabels, 80) || tooLong(venues, 120) || tooLong(cities, 80) || tooLong(urls, 2000)) {
    return { error: "err_form" };
  }

  const places: ExtraPlace[] = [];
  for (let index = 0; index < placeCount; index += 1) {
    const row = {
      label: placeLabels[index] ?? "",
      venue_name: venues[index] ?? "",
      city: cities[index] ?? "",
      location_url: urls[index] ?? "",
    };
    if (!row.label.trim() && !row.venue_name.trim() && !row.city.trim() && !row.location_url.trim()) continue;
    const parsed = extraPlaceRow.safeParse(row);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "err_form" };
    places.push(parsed.data);
  }

  return { days, places };
}

export const weddingChildSchema = z.object({
  id: z.string().uuid(),
  wedding_id: z.string().uuid(),
});

export const weddingFeaturesSchema = z.object({
  wedding_id: z.string().uuid(),
});

export const convertSchema = z.object({
  package_id: z.string().uuid().or(z.literal("")).default(""),
  wedding_date: z.string().trim().refine(isIsoDate, "err_date"),
  start_time: optionalTime,
  venue_name: z.string().trim().default(""),
  city: z.string().trim().default(""),
  governorate: z.enum(GOVERNORATES).or(z.literal("")).default(""),
  status: z.enum(WEDDING_STATUSES),
  total: money,
  day_plan: z.string().trim().default(""),
});

export const weddingSchema = z.object({
  client_id: z.string().uuid("err_couple"),
  package_id: z.string().uuid().or(z.literal("")).default(""),
  wedding_date: z.string().trim().refine(isIsoDate, "err_date"),
  start_time: optionalTime,
  venue_name: z.string().trim().default(""),
  city: z.string().trim().default(""),
  governorate: z.enum(GOVERNORATES).or(z.literal("")).default(""),
  location_url: optionalUrl,
  status: z.enum(WEDDING_STATUSES),
  total: money,
  day_plan: z.string().trim().default(""),
});

export const paymentSchema = z.object({
  wedding_id: z.string().uuid(),
  label: z.string().trim().min(1, "err_label"),
  amount: money,
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).default(""),
  paid_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).default(""),
  method: z.enum(PAYMENT_METHODS).or(z.literal("")).default(""),
  note: z.string().trim().default(""),
});

export const markPaidSchema = z.object({
  id: z.string().uuid(),
  paid_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "err_paid_date"),
  method: z.enum(PAYMENT_METHODS),
});

const contractText = (max: number) => z.string().trim().max(max, "err_form").default("");

export const contractSchema = z.object({
  wedding_id: z.string().uuid("err_form"),
  client_names: contractText(200),
  contact: contractText(200),
  address: contractText(240),
  event_date: contractText(800),
  places: contractText(2000),
  schedule: contractText(8000),
  start_time: contractText(20),
  end_time: contractText(20),
  preparations: contractText(400),
  pack: z
    .string()
    .trim()
    .default("")
    .refine((value) => value === "" || value === "1" || value === "2" || value === "3", "err_form"),
  pack1_name: contractText(120),
  pack1_lines: contractText(1500),
  pack1_price: contractText(40),
  pack2_name: contractText(120),
  pack2_lines: contractText(1500),
  pack2_price: contractText(40),
  pack3_name: contractText(120),
  pack3_lines: contractText(1500),
  pack3_price: contractText(40),
  extras: contractText(500),
  total: contractText(40),
  deposit: contractText(40),
  balance: contractText(40),
  signed_place: contractText(80),
  signed_day: contractText(2),
  signed_month: contractText(2),
  signed_year: contractText(4),
});

export const invoiceSchema = z.object({
  wedding_id: z.string().uuid(),
  tva_mode: z.enum(["none", "added", "included"]),
  tva_rate: z.string().trim().default(""),
  issued_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "err_date"),
  note: z.string().trim().max(500).default(""),
  issuer_name: z.string().trim().min(1, "err_name").max(120),
  issuer_phone: z.string().trim().max(40).default(""),
  issuer_address: z.string().trim().max(240).default(""),
  tax_id: z.string().trim().max(40).default(""),
});

export const assignSchema = z.object({
  wedding_id: z.string().uuid(),
  member_id: z.string().uuid("err_member"),
  role_on_day: z.string().trim().max(60).default(""),
  pay: optionalMoney,
});

export const assignmentUpdateSchema = z.object({
  wedding_id: z.string().uuid(),
  member_id: z.string().uuid("err_member"),
  previous_member_id: z.string().uuid(),
  role_on_day: z.string().trim().max(60).default(""),
  pay: optionalMoney,
});

export const crewPaidSchema = z.object({
  wedding_id: z.string().uuid(),
  member_id: z.string().uuid(),
  paid: z.enum(["true", "false"]),
});

export const expenseSchema = z.object({
  wedding_id: z.string().uuid().or(z.literal("")).default(""),
  category: z.string().trim().min(1, "err_category"),
  amount: money,
  spent_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "err_date"),
  note: z.string().trim().default(""),
});

export const taskSchema = z.object({
  wedding_id: z.string().uuid(),
  title: z.string().trim().min(1, "err_title"),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).default(""),
  status: z.enum(TASK_STATUSES).default("todo"),
  assignee_id: z.string().uuid().or(z.literal("")).default(""),
});

export const noteSchema = z.object({
  body: z.string().trim().min(1, "err_note").max(2000),
});

export const memberSchema = z
  .object({
    full_name: z.string().trim().min(1, "err_name"),
    role: z.enum(["member", "assistant"]).default("member"),
    job: z.string().trim().max(60).default(""),
    instagram,
    phone: phone.or(z.literal("")).default(""),
    rate: optionalMoney,
    email: z.string().trim().email("err_email").or(z.literal("")).default(""),
    password: z.string().default(""),
  })
  .refine((data) => !data.email || data.password.length >= 8, {
    message: "err_password",
  })
  .refine((data) => !data.password || data.email, {
    message: "err_login_email",
  });

export const memberUpdateSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().trim().min(1, "err_name"),
  job: z.string().trim().max(60).default(""),
  instagram,
  phone: phone.or(z.literal("")).default(""),
  rate: optionalMoney,
});

export const memberRoleSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["member", "assistant"]),
});

export const memberLoginSchema = z.object({
  id: z.string().uuid(),
  email: z.string().trim().email("err_email"),
  password: z.string().min(8, "err_password").max(72, "password_too_long"),
});

export const memberLoginUpdateSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().trim().email("err_email"),
    password: z.string().max(72, "password_too_long").default(""),
  })
  .refine((data) => !data.password || data.password.length >= 8, {
    message: "err_password",
  });

export const loginSchema = z.object({
  email: z.string().trim().email("err_email"),
  password: z.string().min(1, "err_password_required"),
});

export function parseForm<T>(
  schema: z.ZodType<T>,
  formData: FormData,
): { data: T } | { error: string } {
  const raw: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === "string" && !(key in raw)) raw[key] = value;
  });
  for (const key of ["includes_album", "includes_video", "includes_drone", "active"]) {
    raw[key] = raw[key] === "on" || raw[key] === "true" ? "true" : "false";
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return { error: result.error.issues[0]?.message ?? "err_form" };
  }
  return { data: result.data };
}
