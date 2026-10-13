import { inquiryPayloadSchema, parseInquiryDate, splitInquiryContact } from "@/lib/inquiries";
import { createAdminClient } from "@/lib/supabase/admin";

const REPEAT_WINDOW_MS = 10 * 60 * 1000;
const MAX_BODY = 8000;

function allowedOrigins() {
  return (process.env.CONTACT_SITE_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

export function inquiryOriginAllowed(origin: string | null) {
  if (!origin) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return allowedOrigins().includes(origin.replace(/\/$/, ""));
}

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !inquiryOriginAllowed(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function reply(body: unknown, status: number, origin: string | null) {
  return Response.json(body, { status, headers: corsHeaders(origin) });
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || !inquiryOriginAllowed(origin)) return new Response(null, { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(origin),
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!inquiryOriginAllowed(origin)) {
    console.error("Inquiry rejected: origin");
    return new Response(null, { status: 403 });
  }

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY) return reply({ error: "invalid" }, 413, origin);

  let payload: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return reply({ error: "invalid" }, 413, origin);
    payload = JSON.parse(text);
  } catch {
    return reply({ error: "invalid" }, 400, origin);
  }

  const parsed = inquiryPayloadSchema.safeParse(payload);
  if (!parsed.success) return reply({ error: "invalid" }, 400, origin);
  if (parsed.data.fax) return reply({ ok: true }, 200, origin);

  const contact = splitInquiryContact(parsed.data.contact);
  if (!contact) return reply({ error: "invalid" }, 400, origin);

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    console.error("Inquiry insert failed: service role is not configured");
    return reply({ error: "unavailable" }, 503, origin);
  }

  const since = new Date(Date.now() - REPEAT_WINDOW_MS).toISOString();
  const recent = admin.from("inquiries").select("id").gte("created_at", since).limit(1);
  const filtered = contact.email ? recent.eq("email", contact.email) : recent.eq("phone", contact.phone ?? "");
  const { data: duplicate, error: duplicateError } = await filtered;
  if (duplicateError) {
    console.error("Inquiry lookup failed:", duplicateError.code);
    return reply({ error: "unavailable" }, 503, origin);
  }
  if (duplicate && duplicate.length > 0) {
    console.error("Inquiry rejected: repeated contact");
    return reply({ error: "repeat" }, 429, origin);
  }

  const { error } = await admin.from("inquiries").insert({
    name: parsed.data.name,
    instagram: parsed.data.instagram,
    wedding_date_text: parsed.data.wedding_date,
    wedding_date: parseInquiryDate(parsed.data.wedding_date),
    venue: parsed.data.venue,
    guest_count: parsed.data.guests,
    planner: parsed.data.planner,
    found_on: parsed.data.found_on,
    email: contact.email,
    phone: contact.phone,
  });
  if (error) {
    console.error("Inquiry insert failed:", error.code);
    return reply({ error: "unavailable" }, 503, origin);
  }

  return reply({ ok: true }, 201, origin);
}
