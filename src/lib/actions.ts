"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n";
import { canManageCrm, requireAdmin, requireManager, requireUser } from "@/lib/auth";
import { one, todayInTunis } from "@/lib/constants";
import { rateToBps } from "@/lib/money";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  assignmentUpdateSchema,
  assignSchema,
  clientSchema,
  convertSchema,
  crewPaidSchema,
  expenseSchema,
  extraSchema,
  leadSchema,
  loginSchema,
  markPaidSchema,
  memberLoginSchema,
  memberLoginUpdateSchema,
  memberSchema,
  memberRoleSchema,
  memberUpdateSchema,
  noteSchema,
  offerSchema,
  packageSchema,
  paymentSchema,
  contractSchema,
  invoiceSchema,
  quickBookSchema,
  taskSchema,
  weddingChildSchema,
  weddingDaySchema,
  weddingExtraPriceSchema,
  weddingExtraSchema,
  weddingFeaturesSchema,
  weddingPlaceSchema,
  weddingSchema,
  parseForm,
} from "@/lib/validators";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const ALLOWED_FILE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);
const ALLOWED_FILE_EXTENSION = /\.(jpe?g|png|webp|heic|heif|pdf)$/i;

function withParam(path: string, key: string, value: string) {
  return `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;
}

function fail(path: string, message: string): never {
  redirect(withParam(path, "error", message));
}

function done(path: string, message: string): never {
  redirect(withParam(path, "notice", message));
}

function returnTo(formData: FormData, fallback: string) {
  const value = String(formData.get("return_to") ?? "");
  return value.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

function emptyToNull(value: string | undefined | null) {
  return value ? value : null;
}

function loginCreateError(error: { code?: string; message?: string } | null) {
  const code = error?.code ?? "";
  const message = error?.message ?? "";
  if (code === "email_exists" || /already been registered/i.test(message)) return "email_taken";
  if (code === "weak_password" || /at least \d+ characters/i.test(message)) return "err_password";
  if (/longer than 72/i.test(message)) return "password_too_long";
  if (code === "over_request_rate_limit" || /rate limit/i.test(message)) return "too_many_attempts";
  if (code === "validation_failed" && /email/i.test(message)) return "err_email";
  return "create_login_failed";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asFeatures(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 40);
}

function featureLines(formData: FormData) {
  const lines = formData
    .getAll("feature")
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
  if (lines.length > 40 || lines.some((line) => line.length > 160)) return "err_features" as const;
  return lines;
}

async function dateTaken(supabase: Supabase, date: string, excludeId?: string) {
  let main = supabase
    .from("weddings")
    .select("id", { count: "exact", head: true })
    .eq("wedding_date", date)
    .neq("status", "cancelled");
  if (excludeId) main = main.neq("id", excludeId);
  const { count } = await main;
  if ((count ?? 0) > 0) return true;

  let extra = supabase.from("wedding_days").select("wedding_id").eq("day_date", date);
  if (excludeId) extra = extra.neq("wedding_id", excludeId);
  const { data } = await extra;
  const ids = [...new Set((data ?? []).map((row) => row.wedding_id))];
  if (ids.length === 0) return false;
  const { count: extraCount } = await supabase
    .from("weddings")
    .select("id", { count: "exact", head: true })
    .in("id", ids)
    .neq("status", "cancelled");
  return (extraCount ?? 0) > 0;
}

function doubleBookingMessage(date: string) {
  return `date_taken:${date}`;
}

function revalidateWeddingMoney(weddingId: string) {
  revalidatePath(`/weddings/${weddingId}`);
  revalidatePath(`/weddings/${weddingId}/contract`);
  revalidatePath("/weddings");
  revalidatePath("/payments");
  revalidatePath("/");
}

async function writeOfferTotal(supabase: Supabase, weddingId: string, ownedBefore: boolean) {
  const { data: wedding, error: weddingError } = await supabase
    .from("weddings")
    .select("package_price_millimes")
    .eq("id", weddingId)
    .maybeSingle();
  if (weddingError || !wedding) return false;
  const { data: lines, error: linesError } = await supabase
    .from("wedding_extras")
    .select("price_millimes")
    .eq("wedding_id", weddingId);
  if (linesError) return false;
  const extras = lines ?? [];
  const owned = wedding.package_price_millimes != null || extras.length > 0;
  if (!owned && !ownedBefore) return true;
  const total = owned
    ? (wedding.package_price_millimes ?? 0) + extras.reduce((sum, line) => sum + line.price_millimes, 0)
    : 0;
  const { error } = await supabase.from("weddings").update({ total_millimes: total }).eq("id", weddingId);
  return !error;
}

export async function signIn(formData: FormData) {
  const parsed = parseForm(loginSchema, formData);
  if ("error" in parsed) fail("/login", parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    console.error("Sign-in failed:", error.status, error.code, error.message);
    if (error.code === "invalid_credentials") fail("/login", "bad_credentials");
    if (error.status === 429) fail("/login", "too_many_attempts");
    if (error.code === "email_not_confirmed") fail("/login", "email_unconfirmed");
    fail("/login", "signin_unreachable");
  }
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function saveLead(formData: FormData) {
  const profile = await requireManager();
  const id = String(formData.get("id") ?? "");
  const back = id ? `/leads/${id}` : "/clients?tab=leads";
  const parsed = parseForm(leadSchema, formData);
  if ("error" in parsed) fail(back, parsed.error);
  const supabase = await createClient();
  const row = {
    partner_one_name: parsed.data.partner_one_name,
    partner_two_name: parsed.data.partner_two_name,
    phone: parsed.data.phone,
    whatsapp_phone: emptyToNull(parsed.data.whatsapp_phone),
    email: emptyToNull(parsed.data.email),
    source: parsed.data.source,
    city: parsed.data.city,
    venue: parsed.data.venue,
    wedding_date: emptyToNull(parsed.data.wedding_date),
    status: parsed.data.status,
    package_id: emptyToNull(parsed.data.package_id),
  };
  const query = id
    ? supabase.from("leads").update(row).eq("id", id)
    : supabase.from("leads").insert({ ...row, created_by: profile.id });
  const { error } = await query;
  if (error) fail(back, "save_lead_failed");
  revalidatePath("/clients");
  if (id) revalidatePath(back);
  done(back, id ? "lead_saved" : "lead_added");
}

export async function convertLead(formData: FormData) {
  await requireManager();
  const leadId = String(formData.get("lead_id") ?? "");
  const back = `/leads/${leadId}`;
  const parsed = parseForm(convertSchema, formData);
  if ("error" in parsed) fail(back, parsed.error);
  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("id, converted_client_id")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) fail("/clients?tab=leads", "lead_missing");
  if (lead.converted_client_id) fail(back, "lead_already_booked");

  const allowDouble = formData.get("allow_double") === "on";
  if (!allowDouble && parsed.data.status !== "cancelled" && (await dateTaken(supabase, parsed.data.wedding_date))) {
    fail(back, doubleBookingMessage(parsed.data.wedding_date));
  }

  const { data: weddingId, error } = await supabase.rpc("book_lead", {
    p_lead_id: leadId,
    p_package_id: emptyToNull(parsed.data.package_id),
    p_wedding_date: parsed.data.wedding_date,
    p_start_time: emptyToNull(parsed.data.start_time),
    p_venue_name: parsed.data.venue_name,
    p_city: parsed.data.city,
    p_governorate: parsed.data.governorate,
    p_status: parsed.data.status,
    p_total_millimes: parsed.data.total,
    p_day_plan: parsed.data.day_plan,
  });
  if (error || !weddingId) fail(back, "book_lead_failed");

  const packageId = emptyToNull(parsed.data.package_id);
  if (packageId) {
    const { data: pack } = await supabase.from("packages").select("features").eq("id", packageId).maybeSingle();
    if (pack) await supabase.from("weddings").update({ features: asFeatures(pack.features) }).eq("id", weddingId);
  }

  revalidatePath("/clients");
  revalidatePath("/weddings");
  revalidatePath("/");
  done(`/weddings/${weddingId}`, "wedding_booked");
}

export async function saveClient(formData: FormData) {
  await requireManager();
  const id = String(formData.get("id") ?? "");
  const back = id ? `/clients/${id}` : "/clients?tab=booked";
  const parsed = parseForm(clientSchema, formData);
  if ("error" in parsed) fail(back, parsed.error);
  const supabase = await createClient();
  const row = {
    partner_one_name: parsed.data.partner_one_name,
    partner_two_name: parsed.data.partner_two_name,
    phone: parsed.data.phone,
    whatsapp_phone: emptyToNull(parsed.data.whatsapp_phone),
    email: emptyToNull(parsed.data.email),
    city: parsed.data.city,
  };
  const { error } = id
    ? await supabase.from("clients").update(row).eq("id", id)
    : await supabase.from("clients").insert(row);
  if (error) fail(back, "save_couple_failed");
  revalidatePath("/clients");
  if (id) {
    revalidatePath(back);
    const { data: weddings } = await supabase.from("weddings").select("id").eq("client_id", id);
    for (const wedding of weddings ?? []) revalidatePath(`/weddings/${wedding.id}/contract`);
  }
  done(back, id ? "couple_saved" : "couple_added");
}

export async function deleteClient(formData: FormData) {
  await requireManager();
  const id = String(formData.get("id") ?? "");
  const back = `/clients/${id}`;
  const supabase = await createClient();
  const { data: weddings } = await supabase.from("weddings").select("id").eq("client_id", id);
  const weddingIds = (weddings ?? []).map((wedding) => wedding.id);
  if (weddingIds.length > 0) {
    const { data: files } = await supabase.from("files").select("storage_path").in("wedding_id", weddingIds);
    const paths = (files ?? []).map((file) => file.storage_path);
    if (paths.length > 0) {
      const { error: storageError } = await supabase.storage.from("studio-files").remove(paths);
      if (storageError) fail(back, "delete_couple_failed");
    }
  }
  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) fail(back, "delete_couple_failed");
  revalidatePath("/clients");
  revalidatePath("/weddings");
  revalidatePath("/calendar");
  revalidatePath("/payments");
  revalidatePath("/");
  done("/clients?tab=booked", "couple_deleted");
}

export async function savePackage(formData: FormData) {
  await requireManager();
  const id = String(formData.get("id") ?? "");
  const back = id ? `/packages/${id}` : "/packages";
  const parsed = parseForm(packageSchema, formData);
  if ("error" in parsed) fail(back, parsed.error);
  const features = featureLines(formData);
  if (features === "err_features") fail(back, "err_features");
  const supabase = await createClient();
  const row = {
    name: parsed.data.name,
    description: parsed.data.description,
    price_millimes: parsed.data.price,
    coverage_hours: parsed.data.coverage_hours,
    photo_count: parsed.data.photo_count,
    includes_album: parsed.data.includes_album,
    includes_video: parsed.data.includes_video,
    includes_drone: parsed.data.includes_drone,
    active: parsed.data.active,
    features,
  };
  const { error } = id
    ? await supabase.from("packages").update(row).eq("id", id)
    : await supabase.from("packages").insert(row);
  if (error) fail(back, "save_package_failed");
  revalidatePath("/packages");
  done("/packages", id ? "package_saved" : "package_added");
}

export async function deletePackage(formData: FormData) {
  await requireManager();
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.from("packages").delete().eq("id", id);
  if (error) fail(`/packages/${id}`, "delete_package_failed");
  revalidatePath("/packages");
  revalidatePath("/weddings");
  done("/packages", "package_deleted");
}

export async function saveExtra(formData: FormData) {
  await requireManager();
  const id = String(formData.get("id") ?? "");
  const parsed = parseForm(extraSchema, formData);
  if ("error" in parsed) fail("/packages", parsed.error);
  const supabase = await createClient();
  const row = {
    name: parsed.data.name,
    price_millimes: parsed.data.price,
    active: parsed.data.active,
  };
  const { error } = id
    ? await supabase.from("extras").update(row).eq("id", id)
    : await supabase.from("extras").insert(row);
  if (error) fail("/packages", "save_extra_failed");
  revalidatePath("/packages");
  revalidatePath("/weddings");
  done("/packages", id ? "extra_saved" : "extra_added");
}

export async function deleteExtra(formData: FormData) {
  await requireManager();
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.from("extras").delete().eq("id", id);
  if (error) fail("/packages", "delete_extra_failed");
  revalidatePath("/packages");
  revalidatePath("/weddings");
  done("/packages", "extra_deleted");
}

export async function saveWeddingOffer(formData: FormData) {
  await requireManager();
  const weddingId = String(formData.get("wedding_id") ?? "");
  const back = `/weddings/${weddingId}`;
  const parsed = parseForm(offerSchema, formData);
  if ("error" in parsed) fail(back, parsed.error);
  const supabase = await createClient();
  const packageId = emptyToNull(parsed.data.package_id);
  let catalogFeatures: string[] = [];
  if (packageId) {
    const { data: pack, error: packError } = await supabase.from("packages").select("id, features").eq("id", packageId).maybeSingle();
    if (packError || !pack) fail(back, "save_offer_failed");
    catalogFeatures = asFeatures(pack.features);
  }
  const { data: current, error: currentError } = await supabase
    .from("weddings")
    .select("package_id, package_price_millimes")
    .eq("id", parsed.data.wedding_id)
    .maybeSingle();
  if (currentError || !current) fail(back, "save_offer_failed");
  const { count, error: countError } = await supabase
    .from("wedding_extras")
    .select("id", { count: "exact", head: true })
    .eq("wedding_id", parsed.data.wedding_id);
  if (countError) fail(back, "save_offer_failed");
  const packageChanged = packageId !== current.package_id;
  const { error } = await supabase
    .from("weddings")
    .update({
      package_id: packageId,
      package_price_millimes: packageId ? parsed.data.package_price : null,
      ...(packageChanged ? { features: packageId ? catalogFeatures : null } : {}),
    })
    .eq("id", parsed.data.wedding_id);
  if (error) fail(back, "save_offer_failed");
  const priced = await writeOfferTotal(supabase, parsed.data.wedding_id, current.package_price_millimes != null || (count ?? 0) > 0);
  if (!priced) fail(back, "save_offer_failed");
  revalidateWeddingMoney(parsed.data.wedding_id);
  done(back, "offer_saved");
}

export async function addWeddingExtra(formData: FormData) {
  await requireManager();
  const weddingId = String(formData.get("wedding_id") ?? "");
  const back = `/weddings/${weddingId}`;
  const parsed = parseForm(weddingExtraSchema, formData);
  if ("error" in parsed) fail(back, parsed.error);
  const supabase = await createClient();
  const { data: extra, error: extraError } = await supabase
    .from("extras")
    .select("id, name, active")
    .eq("id", parsed.data.extra_id)
    .maybeSingle();
  if (extraError || !extra || !extra.active) fail(back, "add_wedding_extra_failed");
  const { data: current, error: currentError } = await supabase
    .from("weddings")
    .select("package_id, package_price_millimes, total_millimes")
    .eq("id", parsed.data.wedding_id)
    .maybeSingle();
  if (currentError || !current) fail(back, "add_wedding_extra_failed");
  const { data: existingLines, error: linesError } = await supabase
    .from("wedding_extras")
    .select("price_millimes")
    .eq("wedding_id", parsed.data.wedding_id);
  if (linesError) fail(back, "add_wedding_extra_failed");
  const existing = existingLines ?? [];
  if (current.package_id && current.package_price_millimes == null) {
    const base = Math.max(0, current.total_millimes - existing.reduce((sum, line) => sum + line.price_millimes, 0));
    const { error: priceError } = await supabase
      .from("weddings")
      .update({ package_price_millimes: base })
      .eq("id", parsed.data.wedding_id);
    if (priceError) fail(back, "add_wedding_extra_failed");
    current.package_price_millimes = base;
  }
  const { error } = await supabase.from("wedding_extras").insert({
    wedding_id: parsed.data.wedding_id,
    extra_id: extra.id,
    name: extra.name,
    price_millimes: parsed.data.price,
  });
  if (error) fail(back, "add_wedding_extra_failed");
  const priced = await writeOfferTotal(supabase, parsed.data.wedding_id, current.package_price_millimes != null || existing.length > 0);
  if (!priced) fail(back, "add_wedding_extra_failed");
  revalidateWeddingMoney(parsed.data.wedding_id);
  done(back, "wedding_extra_added");
}

export async function updateWeddingExtra(formData: FormData) {
  await requireManager();
  const weddingId = String(formData.get("wedding_id") ?? "");
  const back = `/weddings/${weddingId}`;
  const parsed = parseForm(weddingExtraPriceSchema, formData);
  if ("error" in parsed) fail(back, parsed.error);
  const supabase = await createClient();
  const { data: current, error: currentError } = await supabase
    .from("weddings")
    .select("package_price_millimes")
    .eq("id", parsed.data.wedding_id)
    .maybeSingle();
  if (currentError || !current) fail(back, "update_wedding_extra_failed");
  const { data: updated, error } = await supabase
    .from("wedding_extras")
    .update({ price_millimes: parsed.data.price })
    .eq("id", parsed.data.id)
    .eq("wedding_id", parsed.data.wedding_id)
    .select("id");
  if (error || !updated?.length) fail(back, "update_wedding_extra_failed");
  const priced = await writeOfferTotal(supabase, parsed.data.wedding_id, true);
  if (!priced) fail(back, "update_wedding_extra_failed");
  revalidateWeddingMoney(parsed.data.wedding_id);
  done(back, "wedding_extra_updated");
}

export async function removeWeddingExtra(formData: FormData) {
  await requireManager();
  const weddingId = String(formData.get("wedding_id") ?? "");
  const id = String(formData.get("id") ?? "");
  const back = `/weddings/${weddingId}`;
  if (!id) fail(back, "remove_wedding_extra_failed");
  const supabase = await createClient();
  const { data: current, error: currentError } = await supabase
    .from("weddings")
    .select("package_price_millimes")
    .eq("id", weddingId)
    .maybeSingle();
  if (currentError || !current) fail(back, "remove_wedding_extra_failed");
  const { data: removed, error } = await supabase.from("wedding_extras").delete().eq("id", id).eq("wedding_id", weddingId).select("id");
  if (error || !removed?.length) fail(back, "remove_wedding_extra_failed");
  const priced = await writeOfferTotal(supabase, weddingId, true);
  if (!priced) fail(back, "remove_wedding_extra_failed");
  revalidateWeddingMoney(weddingId);
  done(back, "wedding_extra_removed");
}

function touchWedding(weddingId: string) {
  revalidatePath(`/weddings/${weddingId}`);
  revalidatePath(`/weddings/${weddingId}/contract`);
  revalidatePath("/weddings");
  revalidatePath("/calendar");
  revalidatePath("/");
}

export async function addWeddingDay(formData: FormData) {
  await requireManager();
  const weddingId = String(formData.get("wedding_id") ?? "");
  const back = `/weddings/${weddingId}`;
  const parsed = parseForm(weddingDaySchema, formData);
  if ("error" in parsed) fail(back, parsed.error);
  const supabase = await createClient();
  const { data: wedding, error: weddingError } = await supabase
    .from("weddings")
    .select("id, wedding_date, status")
    .eq("id", parsed.data.wedding_id)
    .maybeSingle();
  if (weddingError || !wedding) fail(back, "add_day_failed");
  if (wedding.wedding_date === parsed.data.day_date) fail(back, "day_is_main");
  const allowDouble = formData.get("allow_double") === "on";
  if (!allowDouble && wedding.status !== "cancelled" && (await dateTaken(supabase, parsed.data.day_date, wedding.id))) {
    fail(back, doubleBookingMessage(parsed.data.day_date));
  }
  const { error } = await supabase.from("wedding_days").insert({
    wedding_id: wedding.id,
    day_date: parsed.data.day_date,
    start_time: emptyToNull(parsed.data.start_time),
    label: parsed.data.label,
  });
  if (error?.code === "23505") fail(back, "day_exists");
  if (error) fail(back, "add_day_failed");
  touchWedding(wedding.id);
  done(back, "day_added");
}

export async function removeWeddingDay(formData: FormData) {
  await requireManager();
  const parsed = parseForm(weddingChildSchema, formData);
  const weddingId = String(formData.get("wedding_id") ?? "");
  const back = `/weddings/${weddingId}`;
  if ("error" in parsed) fail(back, "remove_day_failed");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wedding_days")
    .delete()
    .eq("id", parsed.data.id)
    .eq("wedding_id", parsed.data.wedding_id)
    .select("id");
  if (error || !data?.length) fail(back, "remove_day_failed");
  touchWedding(parsed.data.wedding_id);
  done(back, "day_removed");
}

export async function addWeddingPlace(formData: FormData) {
  await requireManager();
  const weddingId = String(formData.get("wedding_id") ?? "");
  const back = `/weddings/${weddingId}`;
  const parsed = parseForm(weddingPlaceSchema, formData);
  if ("error" in parsed) fail(back, parsed.error);
  const supabase = await createClient();
  const { data: wedding, error: weddingError } = await supabase
    .from("weddings")
    .select("id")
    .eq("id", parsed.data.wedding_id)
    .maybeSingle();
  if (weddingError || !wedding) fail(back, "add_place_failed");
  const { error } = await supabase.from("wedding_locations").insert({
    wedding_id: wedding.id,
    label: parsed.data.label,
    venue_name: parsed.data.venue_name,
    city: parsed.data.city,
    location_url: parsed.data.location_url,
  });
  if (error) fail(back, "add_place_failed");
  touchWedding(wedding.id);
  done(back, "place_added");
}

export async function removeWeddingPlace(formData: FormData) {
  await requireManager();
  const parsed = parseForm(weddingChildSchema, formData);
  const weddingId = String(formData.get("wedding_id") ?? "");
  const back = `/weddings/${weddingId}`;
  if ("error" in parsed) fail(back, "remove_place_failed");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wedding_locations")
    .delete()
    .eq("id", parsed.data.id)
    .eq("wedding_id", parsed.data.wedding_id)
    .select("id");
  if (error || !data?.length) fail(back, "remove_place_failed");
  touchWedding(parsed.data.wedding_id);
  done(back, "place_removed");
}

export async function saveWeddingFeatures(formData: FormData) {
  await requireManager();
  const weddingId = String(formData.get("wedding_id") ?? "");
  const back = `/weddings/${weddingId}`;
  const parsed = parseForm(weddingFeaturesSchema, formData);
  if ("error" in parsed) fail(back, "save_inclusions_failed");
  const features = featureLines(formData);
  if (features === "err_features") fail(back, "err_features");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("weddings")
    .update({ features })
    .eq("id", parsed.data.wedding_id)
    .select("id");
  if (error || !data?.length) fail(back, "save_inclusions_failed");
  revalidatePath(back);
  revalidatePath(`/weddings/${parsed.data.wedding_id}/contract`);
  done(back, "inclusions_saved");
}

export async function resetWeddingFeatures(formData: FormData) {
  await requireManager();
  const weddingId = String(formData.get("wedding_id") ?? "");
  const back = `/weddings/${weddingId}`;
  const parsed = parseForm(weddingFeaturesSchema, formData);
  if ("error" in parsed) fail(back, "save_inclusions_failed");
  const supabase = await createClient();
  const { data: wedding, error: weddingError } = await supabase
    .from("weddings")
    .select("package_id")
    .eq("id", parsed.data.wedding_id)
    .maybeSingle();
  if (weddingError || !wedding?.package_id) fail(back, "save_inclusions_failed");
  const { data: pack, error: packError } = await supabase
    .from("packages")
    .select("features")
    .eq("id", wedding.package_id)
    .maybeSingle();
  if (packError || !pack) fail(back, "save_inclusions_failed");
  const { error } = await supabase
    .from("weddings")
    .update({ features: asFeatures(pack.features) })
    .eq("id", parsed.data.wedding_id);
  if (error) fail(back, "save_inclusions_failed");
  revalidatePath(back);
  revalidatePath(`/weddings/${parsed.data.wedding_id}/contract`);
  done(back, "inclusions_reset");
}

export async function saveWedding(formData: FormData) {
  await requireManager();
  const id = String(formData.get("id") ?? "");
  const back = id ? `/weddings/${id}` : "/weddings";
  const parsed = parseForm(weddingSchema, formData);
  if ("error" in parsed) fail(back, parsed.error);
  const supabase = await createClient();
  const data = parsed.data;

  const { data: current } = id
    ? await supabase.from("weddings").select("wedding_date, status, package_id, package_price_millimes").eq("id", id).maybeSingle()
    : { data: null };

  const allowDouble = formData.get("allow_double") === "on";
  if (!allowDouble && data.status !== "cancelled") {
    const dateChanged = !current || current.wedding_date !== data.wedding_date || current.status === "cancelled";
    if (dateChanged && (await dateTaken(supabase, data.wedding_date, id || undefined))) {
      fail(back, doubleBookingMessage(data.wedding_date));
    }
  }

  const nextPackageId = emptyToNull(data.package_id);
  let packagePrice: number | null = current?.package_price_millimes ?? null;
  const packageChanged = !current || nextPackageId !== current.package_id;
  let nextFeatures: string[] | null | undefined;
  if (!nextPackageId) {
    packagePrice = null;
    if (packageChanged) nextFeatures = null;
  } else if (packageChanged) {
    const { data: pack, error: packError } = await supabase
      .from("packages")
      .select("price_millimes, features")
      .eq("id", nextPackageId)
      .maybeSingle();
    if (packError || !pack) fail(back, "save_wedding_failed");
    packagePrice = pack.price_millimes;
    nextFeatures = asFeatures(pack.features);
  }

  let extras = { count: 0, sum: 0 };
  if (id) {
    const { data: lines, error: linesError } = await supabase.from("wedding_extras").select("price_millimes").eq("wedding_id", id);
    if (linesError) fail(back, "save_wedding_failed");
    const rows = lines ?? [];
    extras = { count: rows.length, sum: rows.reduce((sum, line) => sum + line.price_millimes, 0) };
  }

  const offerOwns = packagePrice != null || extras.count > 0;
  let total = data.total;
  if (offerOwns) {
    total = (packagePrice ?? 0) + extras.sum;
  } else if (current?.package_price_millimes != null) {
    total = 0;
  }

  if (id) {
    const { error } = await supabase
      .from("weddings")
      .update({
        client_id: data.client_id,
        package_id: nextPackageId,
        package_price_millimes: packagePrice,
        wedding_date: data.wedding_date,
        start_time: emptyToNull(data.start_time),
        venue_name: data.venue_name,
        city: data.city,
        governorate: data.governorate,
        location_url: data.location_url,
        status: data.status,
        total_millimes: total,
        day_plan: data.day_plan,
        ...(nextFeatures !== undefined ? { features: nextFeatures } : {}),
      })
      .eq("id", id);
    if (error) fail(back, "save_wedding_failed");
    const { error: dayError } = await supabase.from("wedding_days").delete().eq("wedding_id", id).eq("day_date", data.wedding_date);
    if (dayError) fail(back, "save_wedding_failed");
    revalidateWeddingMoney(id);
    revalidatePath("/calendar");
    done(back, "wedding_saved");
  }

  const { data: weddingId, error } = await supabase.rpc("create_wedding", {
    p_client_id: data.client_id,
    p_package_id: nextPackageId,
    p_lead_id: null,
    p_wedding_date: data.wedding_date,
    p_start_time: emptyToNull(data.start_time),
    p_venue_name: data.venue_name,
    p_city: data.city,
    p_governorate: data.governorate,
    p_status: data.status,
    p_total_millimes: total,
    p_day_plan: data.day_plan,
  });
  if (error || !weddingId) fail(back, "wedding_unsaved");
  const patch: { location_url?: string; package_price_millimes?: number; features?: string[] | null } = {};
  if (data.location_url) patch.location_url = data.location_url;
  if (packagePrice != null) patch.package_price_millimes = packagePrice;
  if (nextFeatures !== undefined) patch.features = nextFeatures;
  if (Object.keys(patch).length > 0) {
    const { error: linkError } = await supabase.from("weddings").update(patch).eq("id", weddingId);
    if (linkError) fail(`/weddings/${weddingId}`, "save_wedding_failed");
  }
  revalidatePath("/weddings");
  revalidatePath("/payments");
  revalidatePath("/");
  done(`/weddings/${weddingId}`, "wedding_added");
}

export async function savePayment(formData: FormData) {
  await requireManager();
  const destination = returnTo(formData, "/payments");
  const id = String(formData.get("id") ?? "");
  if (id && !UUID.test(id)) fail(destination, "save_payment_failed");
  const back = id ? withParam(destination, "edit", id) : destination;
  const parsed = parseForm(paymentSchema, formData);
  if ("error" in parsed) fail(back, parsed.error);
  const supabase = await createClient();
  const row = {
    wedding_id: parsed.data.wedding_id,
    label: parsed.data.label,
    amount_millimes: parsed.data.amount,
    due_date: emptyToNull(parsed.data.due_date),
    paid_at: emptyToNull(parsed.data.paid_at),
    method: emptyToNull(parsed.data.method),
    note: parsed.data.note,
  };
  if (id) {
    const { data: current, error: currentError } = await supabase
      .from("payments")
      .select("wedding_id")
      .eq("id", id)
      .maybeSingle();
    if (currentError || !current) fail(back, "save_payment_failed");
    const { data, error } = await supabase.from("payments").update(row).eq("id", id).select("id").maybeSingle();
    if (error || !data) fail(back, "save_payment_failed");
    revalidateWeddingMoney(current.wedding_id);
    if (current.wedding_id !== parsed.data.wedding_id) revalidateWeddingMoney(parsed.data.wedding_id);
    done(destination, "payment_saved");
  }
  const { error } = await supabase.from("payments").insert(row);
  if (error) fail(back, "save_payment_failed");
  revalidateWeddingMoney(parsed.data.wedding_id);
  done(destination, "payment_added");
}

export async function deletePayment(formData: FormData) {
  await requireManager();
  const destination = returnTo(formData, "/payments");
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) fail(destination, "delete_payment_failed");
  const supabase = await createClient();
  const { data, error } = await supabase.from("payments").delete().eq("id", id).select("wedding_id").maybeSingle();
  if (error || !data) fail(destination, "delete_payment_failed");
  revalidateWeddingMoney(data.wedding_id);
  done(destination, "payment_deleted");
}

export async function saveInvoice(formData: FormData) {
  await requireManager();
  const weddingId = String(formData.get("wedding_id") ?? "");
  const back = weddingId ? `/invoices/new?wedding=${weddingId}` : "/payments";
  const parsed = parseForm(invoiceSchema, formData);
  if ("error" in parsed) fail(back, parsed.error);
  const ids = [...new Set(formData.getAll("payment_id").filter((value): value is string => typeof value === "string"))];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (ids.length === 0 || ids.some((id) => !uuid.test(id))) fail(back, "err_invoice_lines");
  const bps = parsed.data.tva_mode === "none" ? 0 : rateToBps(parsed.data.tva_rate);
  if (bps === null) fail(back, "err_tva");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_invoice", {
    p_wedding_id: parsed.data.wedding_id,
    p_payment_ids: ids,
    p_issued_on: parsed.data.issued_on,
    p_tva_mode: parsed.data.tva_mode,
    p_tva_rate_bps: bps,
    p_issuer_name: parsed.data.issuer_name,
    p_issuer_phone: parsed.data.issuer_phone,
    p_issuer_address: parsed.data.issuer_address,
    p_tax_id: parsed.data.tax_id,
    p_note: parsed.data.note,
  });
  if (error || !data) {
    const missing = /not on this wedding/i.test(error?.message ?? "");
    fail(back, missing ? "invoice_payments" : "save_invoice_failed");
  }
  revalidatePath("/payments");
  revalidatePath(`/weddings/${parsed.data.wedding_id}`);
  redirect(`/invoices/${data}`);
}

export async function deleteWedding(formData: FormData) {
  await requireManager();
  const id = String(formData.get("id") ?? "");
  const back = `/weddings/${id}`;
  if (!UUID.test(id)) fail("/weddings", "delete_wedding_failed");
  const supabase = await createClient();
  const { data: wedding } = await supabase.from("weddings").select("id").eq("id", id).maybeSingle();
  if (!wedding) fail("/weddings", "delete_wedding_failed");
  const { data: files } = await supabase.from("files").select("storage_path").eq("wedding_id", id);
  const paths = (files ?? []).map((file) => file.storage_path);
  if (paths.length > 0) {
    const { error: storageError } = await supabase.storage.from("studio-files").remove(paths);
    if (storageError) fail(back, "delete_wedding_failed");
  }
  const { error: invoiceError } = await supabase.from("invoices").delete().eq("wedding_id", id);
  if (invoiceError) fail(back, "delete_wedding_failed");
  const { error } = await supabase.from("weddings").delete().eq("id", id);
  if (error) fail(back, "delete_wedding_failed");
  revalidatePath("/weddings");
  revalidatePath("/calendar");
  revalidatePath("/payments");
  revalidatePath("/clients");
  revalidatePath("/");
  done("/weddings", "wedding_deleted");
}

export async function saveContract(formData: FormData) {
  await requireManager();
  const weddingId = String(formData.get("wedding_id") ?? "");
  const back = `/weddings/${weddingId}/contract`;
  const parsed = parseForm(contractSchema, formData);
  if ("error" in parsed) fail(back, parsed.error);
  const supabase = await createClient();
  const { data: wedding, error: weddingError } = await supabase
    .from("weddings")
    .select("id")
    .eq("id", parsed.data.wedding_id)
    .maybeSingle();
  if (weddingError || !wedding) fail(back, "save_contract_failed");
  const { wedding_id: weddingIdSaved, ...fields } = parsed.data;
  const { error } = await supabase.from("contracts").upsert({
    wedding_id: weddingIdSaved,
    fields,
    updated_at: new Date().toISOString(),
  });
  if (error) fail(back, "save_contract_failed");
  revalidatePath(back);
  done(back, "contract_saved");
}

export async function resetContract(formData: FormData) {
  await requireManager();
  const weddingId = String(formData.get("wedding_id") ?? "");
  const back = `/weddings/${weddingId}/contract`;
  const parsed = parseForm(contractSchema.pick({ wedding_id: true }), formData);
  if ("error" in parsed) fail(back, parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.from("contracts").delete().eq("wedding_id", parsed.data.wedding_id);
  if (error) fail(back, "reset_contract_failed");
  revalidatePath(back);
  done(back, "contract_reset");
}

export async function markPaymentPaid(formData: FormData) {
  await requireManager();
  const back = returnTo(formData, "/payments");
  const parsed = parseForm(markPaidSchema, formData);
  if ("error" in parsed) fail(back, parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payments")
    .update({ paid_at: parsed.data.paid_at, method: parsed.data.method })
    .eq("id", parsed.data.id)
    .select("wedding_id")
    .maybeSingle();
  if (error || !data) fail(back, "update_payment_failed");
  revalidatePath("/payments");
  revalidatePath(`/weddings/${data.wedding_id}`);
  revalidatePath(`/weddings/${data.wedding_id}/contract`);
  revalidatePath("/");
  done(back, "payment_paid");
}

export async function saveExpense(formData: FormData) {
  const profile = await requireManager();
  const destination = returnTo(formData, "/expenses");
  const id = String(formData.get("id") ?? "");
  if (id && !UUID.test(id)) fail(destination, "save_expense_failed");
  const back = id ? withParam(destination, "edit", id) : destination;
  const parsed = parseForm(expenseSchema, formData);
  if ("error" in parsed) fail(back, parsed.error);
  const supabase = await createClient();
  const row = {
    wedding_id: emptyToNull(parsed.data.wedding_id),
    category: parsed.data.category,
    amount_millimes: parsed.data.amount,
    spent_on: parsed.data.spent_on,
    note: parsed.data.note,
  };
  if (id) {
    const { data, error } = await supabase.from("expenses").update(row).eq("id", id).select("id").maybeSingle();
    if (error || !data) fail(back, "save_expense_failed");
    revalidatePath("/expenses");
    revalidatePath("/");
    done(destination, "expense_saved");
  }
  const { error } = await supabase.from("expenses").insert({ ...row, created_by: profile.id });
  if (error) fail(back, "save_expense_failed");
  revalidatePath("/expenses");
  revalidatePath("/");
  done(destination, "expense_added");
}

export async function deleteExpense(formData: FormData) {
  await requireManager();
  const destination = returnTo(formData, "/expenses");
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) fail(destination, "delete_expense_failed");
  const supabase = await createClient();
  const { data, error } = await supabase.from("expenses").delete().eq("id", id).select("id").maybeSingle();
  if (error || !data) fail(destination, "delete_expense_failed");
  revalidatePath("/expenses");
  revalidatePath("/");
  done(destination, "expense_deleted");
}

export async function saveTask(formData: FormData) {
  const profile = await requireUser();
  const parsed = parseForm(taskSchema, formData);
  const weddingId = String(formData.get("wedding_id") ?? "");
  const back = `/weddings/${weddingId}`;
  if ("error" in parsed) fail(back, parsed.error);
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  const row = {
    wedding_id: parsed.data.wedding_id,
    title: parsed.data.title,
    due_date: emptyToNull(parsed.data.due_date),
    status: parsed.data.status,
    assignee_id: canManageCrm(profile) ? emptyToNull(parsed.data.assignee_id) : profile.id,
  };
  const { error } = id
    ? await supabase.from("tasks").update(row).eq("id", id)
    : await supabase.from("tasks").insert(row);
  if (error) fail(back, "save_task_failed");
  revalidatePath(back);
  revalidatePath("/");
  done(back, id ? "task_updated" : "task_added");
}

export async function saveNote(formData: FormData) {
  const profile = await requireUser();
  const parsed = parseForm(noteSchema, formData);
  const weddingId = String(formData.get("wedding_id") ?? "");
  const leadId = String(formData.get("lead_id") ?? "");
  const back = weddingId ? `/weddings/${weddingId}` : `/leads/${leadId}`;
  if ("error" in parsed) fail(back, parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.from("notes").insert({
    body: parsed.data.body,
    wedding_id: emptyToNull(weddingId),
    lead_id: emptyToNull(leadId),
    author_id: profile.id,
  });
  if (error) fail(back, "save_note_failed");
  revalidatePath(back);
  done(back, "note_added");
}

export async function assignMember(formData: FormData) {
  await requireManager();
  const weddingId = String(formData.get("wedding_id") ?? "");
  const back = `/weddings/${weddingId}`;
  const parsed = parseForm(assignSchema, formData);
  if ("error" in parsed) fail(back, parsed.error);
  const supabase = await createClient();
  const { data: member } = await supabase
    .from("profiles")
    .select("job, member_rates(rate_millimes)")
    .eq("id", parsed.data.member_id)
    .maybeSingle();
  const { error } = await supabase.from("wedding_assignments").upsert({
    wedding_id: parsed.data.wedding_id,
    member_id: parsed.data.member_id,
    role_on_day: parsed.data.role_on_day || member?.job || "photographer",
  });
  if (error) fail(back, "assign_failed");
  const rate = one(member?.member_rates as { rate_millimes: number } | { rate_millimes: number }[] | null)?.rate_millimes ?? 0;
  const { error: payError } = await supabase.from("assignment_pay").upsert({
    wedding_id: parsed.data.wedding_id,
    member_id: parsed.data.member_id,
    amount_millimes: parsed.data.pay ?? rate,
  });
  if (payError) fail(back, "assign_pay_failed");
  revalidatePath(back);
  revalidatePath("/team");
  revalidatePath(`/team/${parsed.data.member_id}`);
  revalidatePath("/");
  done(back, "member_assigned");
}

export async function updateAssignment(formData: FormData) {
  await requireManager();
  const weddingId = String(formData.get("wedding_id") ?? "");
  const back = `/weddings/${weddingId}`;
  const parsed = parseForm(assignmentUpdateSchema, formData);
  if ("error" in parsed) fail(back, parsed.error);
  const nextId = parsed.data.member_id;
  const previousId = parsed.data.previous_member_id;
  const supabase = await createClient();
  const { data: member } = await supabase.from("profiles").select("job").eq("id", nextId).maybeSingle();
  const role = parsed.data.role_on_day || member?.job || "photographer";
  const { data: existingPay, error: payLookupError } = await supabase
    .from("assignment_pay")
    .select("amount_millimes, paid_at")
    .eq("wedding_id", weddingId)
    .eq("member_id", previousId)
    .maybeSingle();
  if (payLookupError) fail(back, "assign_pay_failed");
  const amount = parsed.data.pay ?? existingPay?.amount_millimes ?? 0;

  if (nextId !== previousId) {
    const { data: clash } = await supabase
      .from("wedding_assignments")
      .select("member_id")
      .eq("wedding_id", weddingId)
      .eq("member_id", nextId)
      .maybeSingle();
    if (clash) fail(back, "already_assigned");
    const { error: deleteError } = await supabase
      .from("wedding_assignments")
      .delete()
      .eq("wedding_id", weddingId)
      .eq("member_id", previousId);
    if (deleteError) fail(back, "assign_failed");
    const { error } = await supabase.from("wedding_assignments").insert({
      wedding_id: weddingId,
      member_id: nextId,
      role_on_day: role,
    });
    if (error) fail(back, "assign_failed");
  } else {
    const { error } = await supabase
      .from("wedding_assignments")
      .update({ role_on_day: role })
      .eq("wedding_id", weddingId)
      .eq("member_id", previousId);
    if (error) fail(back, "assign_failed");
  }

  const { error: payError } = await supabase.from("assignment_pay").upsert({
    wedding_id: weddingId,
    member_id: nextId,
    amount_millimes: amount,
    paid_at: nextId === previousId ? existingPay?.paid_at ?? null : null,
  });
  if (payError) fail(back, "assign_pay_failed");
  revalidatePath(back);
  revalidatePath("/team");
  revalidatePath(`/team/${previousId}`);
  revalidatePath(`/team/${nextId}`);
  revalidatePath("/");
  done(back, "assignment_saved");
}

export async function unassignMember(formData: FormData) {
  await requireManager();
  const weddingId = String(formData.get("wedding_id") ?? "");
  const memberId = String(formData.get("member_id") ?? "");
  const back = returnTo(formData, `/weddings/${weddingId}`);
  const supabase = await createClient();
  const { error } = await supabase
    .from("wedding_assignments")
    .delete()
    .eq("wedding_id", weddingId)
    .eq("member_id", memberId);
  if (error) fail(back, "unassign_failed");
  revalidatePath(`/weddings/${weddingId}`);
  revalidatePath("/team");
  revalidatePath(`/team/${memberId}`);
  revalidatePath("/");
  done(back, "unassigned");
}

export async function setCrewPaid(formData: FormData) {
  await requireManager();
  const back = returnTo(formData, `/weddings/${String(formData.get("wedding_id") ?? "")}`);
  const parsed = parseForm(crewPaidSchema, formData);
  if ("error" in parsed) fail(back, "pay_update_failed");
  const { wedding_id: weddingId, member_id: memberId } = parsed.data;
  const paid = parsed.data.paid === "true";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assignment_pay")
    .update({ paid_at: paid ? todayInTunis() : null })
    .eq("wedding_id", weddingId)
    .eq("member_id", memberId)
    .select("wedding_id")
    .maybeSingle();
  if (error || !data) fail(back, "pay_update_failed");
  revalidatePath(`/weddings/${weddingId}`);
  revalidatePath("/team");
  revalidatePath(`/team/${memberId}`);
  revalidatePath("/");
  done(back, paid ? "marked_paid" : "marked_unpaid");
}

export async function deleteTask(formData: FormData) {
  await requireManager();
  const id = String(formData.get("id") ?? "");
  const weddingId = String(formData.get("wedding_id") ?? "");
  const back = `/weddings/${weddingId}`;
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) fail(back, "delete_task_failed");
  revalidatePath(back);
  revalidatePath("/");
  done(back, "task_deleted");
}

export async function quickBook(formData: FormData) {
  await requireManager();
  const date = String(formData.get("wedding_date") ?? "");
  const back = `/calendar?month=${date.slice(0, 7)}&add=${date}`;
  const parsed = parseForm(quickBookSchema, formData);
  if ("error" in parsed) fail(back, parsed.error);
  const supabase = await createClient();
  if (formData.get("allow_double") !== "on" && (await dateTaken(supabase, parsed.data.wedding_date))) {
    fail(back, doubleBookingMessage(parsed.data.wedding_date));
  }
  const { data: weddingId, error } = await supabase.rpc("quick_book", {
    p_partner_one_name: parsed.data.partner_one_name,
    p_partner_two_name: parsed.data.partner_two_name,
    p_phone: parsed.data.phone,
    p_whatsapp_phone: emptyToNull(parsed.data.whatsapp_phone),
    p_wedding_date: parsed.data.wedding_date,
    p_venue_name: parsed.data.venue_name,
    p_total_millimes: parsed.data.total ?? 0,
  });
  if (error || !weddingId) fail(back, "book_wedding_failed");
  revalidatePath("/calendar");
  revalidatePath("/weddings");
  revalidatePath("/clients");
  revalidatePath("/");
  done(`/calendar?month=${date.slice(0, 7)}`, "wedding_booked");
}

export async function uploadWeddingFile(formData: FormData) {
  const profile = await requireUser();
  const weddingId = String(formData.get("wedding_id") ?? "");
  const back = `/weddings/${weddingId}`;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    fail(back, "choose_file");
  }
  if (file.size > 4 * 1024 * 1024) {
    fail(back, "file_too_big");
  }
  if (!ALLOWED_FILE_EXTENSION.test(file.name) || (file.type && !ALLOWED_FILE_TYPES.has(file.type))) {
    fail(back, "file_type");
  }
  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 80);
  const path = `${weddingId}/${crypto.randomUUID()}-${safeName}`;
  const supabase = await createClient();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from("studio-files")
    .upload(path, bytes, { contentType: file.type || "application/octet-stream" });
  if (uploadError) fail(back, "upload_failed");
  const { error } = await supabase.from("files").insert({
    wedding_id: weddingId,
    storage_path: path,
    file_name: file.name,
    created_by: profile.id,
  });
  if (error) {
    await supabase.storage.from("studio-files").remove([path]);
    fail(back, "save_file_failed");
  }
  revalidatePath(back);
  done(back, "file_uploaded");
}

export async function deleteWeddingFile(formData: FormData) {
  await requireManager();
  const id = String(formData.get("id") ?? "");
  const weddingId = String(formData.get("wedding_id") ?? "");
  const back = `/weddings/${weddingId}`;
  const supabase = await createClient();
  const { data: file } = await supabase
    .from("files")
    .select("id, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (!file) fail(back, "file_missing");
  const { error: storageError } = await supabase.storage.from("studio-files").remove([file.storage_path]);
  if (storageError) fail(back, "delete_file_failed");
  const { error } = await supabase.from("files").delete().eq("id", id);
  if (error) fail(back, "delete_file_failed");
  revalidatePath(back);
  done(back, "file_deleted");
}

export async function createMember(formData: FormData) {
  await requireAdmin();
  const parsed = parseForm(memberSchema, formData);
  if ("error" in parsed) fail("/team", parsed.error);
  const details = {
    role: parsed.data.role,
    full_name: parsed.data.full_name,
    job: parsed.data.job,
    instagram: parsed.data.instagram,
    phone: emptyToNull(parsed.data.phone),
    active: true,
  };

  let memberId: string;
  if (parsed.data.email) {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email: parsed.data.email,
      password: parsed.data.password,
      email_confirm: true,
    });
    if (error || !data.user) {
      console.error("createUser failed:", error?.code, error?.status, error?.message);
      fail("/team", loginCreateError(error));
    }
    const { error: profileError } = await admin
      .from("profiles")
      .insert({ id: data.user.id, has_login: true, ...details });
    if (profileError) {
      await admin.auth.admin.deleteUser(data.user.id);
      fail("/team", "save_profile_failed");
    }
    memberId = data.user.id;
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("profiles")
      .insert({ has_login: false, ...details })
      .select("id")
      .single();
    if (error || !data) fail("/team", "add_member_failed");
    memberId = data.id;
  }

  const supabase = await createClient();
  const { error: rateError } = await supabase
    .from("member_rates")
    .upsert({ member_id: memberId, rate_millimes: parsed.data.rate ?? 0 });
  if (rateError) fail("/team", "rate_failed");
  revalidatePath("/team");
  done("/team", parsed.data.email ? "member_added_login" : "member_added");
}

export async function updateMember(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const back = `/team/${id}`;
  const parsed = parseForm(memberUpdateSchema, formData);
  if ("error" in parsed) fail(back, parsed.error);
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.full_name,
      job: parsed.data.job,
      instagram: parsed.data.instagram,
      phone: emptyToNull(parsed.data.phone),
    })
    .eq("id", parsed.data.id);
  if (error) fail(back, "save_member_failed");
  const { error: rateError } = await supabase
    .from("member_rates")
    .upsert({ member_id: parsed.data.id, rate_millimes: parsed.data.rate ?? 0 });
  if (rateError) fail(back, "saved_rate_failed");
  revalidatePath("/team");
  revalidatePath(back);
  done(back, "member_saved");
}

export async function updateMemberRole(formData: FormData) {
  const current = await requireAdmin();
  const parsed = parseForm(memberRoleSchema, formData);
  if ("error" in parsed) fail("/team", "err_form");
  const back = `/team/${parsed.data.id}`;
  if (parsed.data.id === current.id) fail(back, "cannot_change_self");
  const supabase = await createClient();
  const { data: member, error } = await supabase
    .from("profiles")
    .update({ role: parsed.data.role })
    .eq("id", parsed.data.id)
    .neq("role", "admin")
    .select("id")
    .maybeSingle();
  if (error || !member) fail(back, "save_member_failed");
  console.info("Member role updated:", current.id, member.id, parsed.data.role);
  revalidatePath("/", "layout");
  done(back, "member_saved");
}

export async function grantMemberLogin(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const back = `/team/${id}`;
  const parsed = parseForm(memberLoginSchema, formData);
  if ("error" in parsed) fail(back, parsed.error);
  const admin = createAdminClient();
  const { data: member } = await admin
    .from("profiles")
    .select("id, has_login")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!member) fail("/team", "member_missing");
  const { data: existing } = await admin.auth.admin.getUserById(member.id);
  if (existing.user) fail(back, "already_has_login");
  const { data, error } = await admin.auth.admin.createUser({
    id: member.id,
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
  });
  if (error || !data.user || data.user.id !== member.id) {
    if (data.user && data.user.id !== member.id) await admin.auth.admin.deleteUser(data.user.id);
    console.error("grantMemberLogin failed:", error?.code, error?.message);
    fail(back, loginCreateError(error));
  }
  const { error: profileError } = await admin.from("profiles").update({ has_login: true }).eq("id", member.id);
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    fail(back, "save_profile_failed");
  }
  revalidatePath("/team");
  revalidatePath(back);
  done(back, "login_added");
}

export async function updateMemberLogin(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const back = `/team/${id}`;
  const parsed = parseForm(memberLoginUpdateSchema, formData);
  if ("error" in parsed) fail(back, parsed.error);
  const admin = createAdminClient();
  const { data: existing, error: lookupError } = await admin.auth.admin.getUserById(parsed.data.id);
  if (lookupError || !existing.user) fail(back, "login_missing");
  const attributes: { email: string; password?: string; email_confirm: boolean } = {
    email: parsed.data.email,
    email_confirm: true,
  };
  if (parsed.data.password) attributes.password = parsed.data.password;
  const { error } = await admin.auth.admin.updateUserById(parsed.data.id, attributes);
  if (error) {
    console.error("updateMemberLogin failed:", error.code, error.message);
    fail(back, loginCreateError(error));
  }
  const { error: profileError } = await admin.from("profiles").update({ has_login: true }).eq("id", parsed.data.id);
  if (profileError) fail(back, "save_profile_failed");
  revalidatePath("/team");
  revalidatePath(back);
  done(back, "login_saved");
}

export async function deleteMember(formData: FormData) {
  const current = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const back = `/team/${id}`;
  if (!UUID.test(id)) fail("/team", "member_missing");
  if (id === current.id) fail(back, "cannot_delete_self");
  const admin = createAdminClient();
  const { data: member } = await admin
    .from("profiles")
    .select("id, has_login")
    .eq("id", id)
    .maybeSingle();
  if (!member) fail("/team", "member_missing");
  if (member.has_login) {
    const { error: authError } = await admin.auth.admin.deleteUser(id);
    const missing = authError?.status === 404 || authError?.code === "user_not_found";
    if (authError && !missing) {
      console.error("deleteMember auth failed:", authError.code, authError.message);
      fail(back, "delete_member_failed");
    }
  }
  const { error } = await admin.from("profiles").delete().eq("id", id);
  if (error) fail(back, "delete_member_failed");
  revalidatePath("/team");
  done("/team", "member_deleted");
}

export async function setMemberActive(formData: FormData) {
  const current = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  const back = returnTo(formData, `/team/${id}`);
  if (id === current.id) fail(back, "cannot_change_self");
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!profile) fail("/team", "member_missing");
  const { error } = await supabase.from("profiles").update({ active }).eq("id", id);
  if (error) fail(back, "update_member_failed");
  revalidatePath("/team");
  revalidatePath(`/team/${id}`);
  done(back, active ? "member_activated" : "member_deactivated");
}

export async function setLocale(formData: FormData) {
  const locale = String(formData.get("locale") ?? "");
  if (!isLocale(locale)) return;
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  const path = returnTo(formData, "/");
  redirect(path);
}
