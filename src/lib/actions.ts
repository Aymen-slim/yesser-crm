"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n";
import { requireAdmin, requireUser } from "@/lib/auth";
import { one, todayInTunis } from "@/lib/constants";
import { rateToBps } from "@/lib/money";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  assignSchema,
  clientSchema,
  convertSchema,
  expenseSchema,
  leadSchema,
  loginSchema,
  markPaidSchema,
  memberSchema,
  memberUpdateSchema,
  noteSchema,
  packageSchema,
  paymentSchema,
  invoiceSchema,
  quickBookSchema,
  taskSchema,
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

async function dateTaken(supabase: Supabase, date: string, excludeId?: string) {
  let query = supabase
    .from("weddings")
    .select("id", { count: "exact", head: true })
    .eq("wedding_date", date)
    .neq("status", "cancelled");
  if (excludeId) query = query.neq("id", excludeId);
  const { count } = await query;
  return (count ?? 0) > 0;
}

function doubleBookingMessage(date: string) {
  return `date_taken:${date}`;
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
  const profile = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const back = id ? `/leads/${id}` : "/clients?tab=leads";
  const parsed = parseForm(leadSchema, formData);
  if ("error" in parsed) fail(back, parsed.error);
  const supabase = await createClient();
  const row = {
    partner_one_name: parsed.data.partner_one_name,
    partner_two_name: parsed.data.partner_two_name,
    phone: parsed.data.phone,
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
  await requireAdmin();
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

  revalidatePath("/clients");
  revalidatePath("/weddings");
  revalidatePath("/");
  done(`/weddings/${weddingId}`, "wedding_booked");
}

export async function saveClient(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const back = id ? `/clients/${id}` : "/clients?tab=booked";
  const parsed = parseForm(clientSchema, formData);
  if ("error" in parsed) fail(back, parsed.error);
  const supabase = await createClient();
  const row = {
    partner_one_name: parsed.data.partner_one_name,
    partner_two_name: parsed.data.partner_two_name,
    phone: parsed.data.phone,
    email: emptyToNull(parsed.data.email),
    city: parsed.data.city,
  };
  const { error } = id
    ? await supabase.from("clients").update(row).eq("id", id)
    : await supabase.from("clients").insert(row);
  if (error) fail(back, "save_couple_failed");
  revalidatePath("/clients");
  if (id) revalidatePath(back);
  done(back, id ? "couple_saved" : "couple_added");
}

export async function savePackage(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const back = id ? `/packages/${id}` : "/packages";
  const parsed = parseForm(packageSchema, formData);
  if ("error" in parsed) fail(back, parsed.error);
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
  };
  const { error } = id
    ? await supabase.from("packages").update(row).eq("id", id)
    : await supabase.from("packages").insert(row);
  if (error) fail(back, "save_package_failed");
  revalidatePath("/packages");
  done("/packages", id ? "package_saved" : "package_added");
}

export async function saveWedding(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const back = id ? `/weddings/${id}` : "/weddings";
  const parsed = parseForm(weddingSchema, formData);
  if ("error" in parsed) fail(back, parsed.error);
  const supabase = await createClient();
  const data = parsed.data;

  const allowDouble = formData.get("allow_double") === "on";
  if (!allowDouble && data.status !== "cancelled") {
    let dateChanged = true;
    if (id) {
      const { data: current } = await supabase.from("weddings").select("wedding_date, status").eq("id", id).maybeSingle();
      dateChanged = !current || current.wedding_date !== data.wedding_date || current.status === "cancelled";
    }
    if (dateChanged && (await dateTaken(supabase, data.wedding_date, id || undefined))) {
      fail(back, doubleBookingMessage(data.wedding_date));
    }
  }

  if (id) {
    const { error } = await supabase
      .from("weddings")
      .update({
        client_id: data.client_id,
        package_id: emptyToNull(data.package_id),
        wedding_date: data.wedding_date,
        start_time: emptyToNull(data.start_time),
        venue_name: data.venue_name,
        city: data.city,
        governorate: data.governorate,
        status: data.status,
        total_millimes: data.total,
        day_plan: data.day_plan,
      })
      .eq("id", id);
    if (error) fail(back, "save_wedding_failed");
    revalidatePath(back);
    revalidatePath("/weddings");
    done(back, "wedding_saved");
  }

  const { data: weddingId, error } = await supabase.rpc("create_wedding", {
    p_client_id: data.client_id,
    p_package_id: emptyToNull(data.package_id),
    p_lead_id: null,
    p_wedding_date: data.wedding_date,
    p_start_time: emptyToNull(data.start_time),
    p_venue_name: data.venue_name,
    p_city: data.city,
    p_governorate: data.governorate,
    p_status: data.status,
    p_total_millimes: data.total,
    p_day_plan: data.day_plan,
  });
  if (error || !weddingId) fail(back, "wedding_unsaved");
  revalidatePath("/weddings");
  revalidatePath("/");
  done(`/weddings/${weddingId}`, "wedding_added");
}

export async function savePayment(formData: FormData) {
  await requireAdmin();
  const back = returnTo(formData, "/payments");
  const parsed = parseForm(paymentSchema, formData);
  if ("error" in parsed) fail(back, parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.from("payments").insert({
    wedding_id: parsed.data.wedding_id,
    label: parsed.data.label,
    amount_millimes: parsed.data.amount,
    due_date: emptyToNull(parsed.data.due_date),
    paid_at: emptyToNull(parsed.data.paid_at),
    method: emptyToNull(parsed.data.method),
    note: parsed.data.note,
  });
  if (error) fail(back, "save_payment_failed");
  revalidatePath("/payments");
  revalidatePath(`/weddings/${parsed.data.wedding_id}`);
  revalidatePath("/");
  done(back, "payment_added");
}

export async function saveInvoice(formData: FormData) {
  await requireAdmin();
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

export async function markPaymentPaid(formData: FormData) {
  await requireAdmin();
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
  revalidatePath("/");
  done(back, "payment_paid");
}

export async function saveExpense(formData: FormData) {
  const profile = await requireAdmin();
  const parsed = parseForm(expenseSchema, formData);
  if ("error" in parsed) fail("/expenses", parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.from("expenses").insert({
    wedding_id: emptyToNull(parsed.data.wedding_id),
    category: parsed.data.category,
    amount_millimes: parsed.data.amount,
    spent_on: parsed.data.spent_on,
    note: parsed.data.note,
    created_by: profile.id,
  });
  if (error) fail("/expenses", "save_expense_failed");
  revalidatePath("/expenses");
  revalidatePath("/");
  done("/expenses", "expense_added");
}

export async function saveTask(formData: FormData) {
  await requireUser();
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
    assignee_id: emptyToNull(parsed.data.assignee_id),
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
  await requireAdmin();
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
  done(back, "member_assigned");
}

export async function unassignMember(formData: FormData) {
  await requireAdmin();
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
  done(back, "unassigned");
}

export async function setCrewPaid(formData: FormData) {
  await requireAdmin();
  const weddingId = String(formData.get("wedding_id") ?? "");
  const memberId = String(formData.get("member_id") ?? "");
  const paid = formData.get("paid") === "true";
  const back = returnTo(formData, `/weddings/${weddingId}`);
  const supabase = await createClient();
  const { error } = await supabase
    .from("assignment_pay")
    .update({ paid_at: paid ? todayInTunis() : null })
    .eq("wedding_id", weddingId)
    .eq("member_id", memberId);
  if (error) fail(back, "pay_update_failed");
  revalidatePath(`/weddings/${weddingId}`);
  revalidatePath("/team");
  revalidatePath("/");
  done(back, paid ? "marked_paid" : "marked_unpaid");
}

export async function deleteTask(formData: FormData) {
  await requireAdmin();
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
  await requireAdmin();
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
  if (file.size > 10 * 1024 * 1024) {
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
  await requireAdmin();
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
    role: "member" as const,
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
    if (error || !data.user) fail("/team", "create_login_failed");
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

export async function deleteMember(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { data: member } = await supabase
    .from("profiles")
    .select("role, has_login")
    .eq("id", id)
    .maybeSingle();
  if (!member || member.role === "admin" || member.has_login) {
    fail(`/team/${id}`, "login_not_deletable");
  }
  const { error } = await supabase.from("profiles").delete().eq("id", id);
  if (error) fail(`/team/${id}`, "delete_member_failed");
  revalidatePath("/team");
  done("/team", "member_deleted");
}

export async function setMemberActive(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", id)
    .maybeSingle();
  if (!profile || profile.role === "admin") fail("/team", "account_locked");
  const { error } = await supabase.from("profiles").update({ active }).eq("id", id);
  if (error) fail("/team", "update_member_failed");
  revalidatePath("/team");
  revalidatePath(`/team/${id}`);
  done(returnTo(formData, "/team"), active ? "member_activated" : "member_deactivated");
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
