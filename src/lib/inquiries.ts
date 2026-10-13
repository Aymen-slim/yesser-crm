import { z } from "zod";
import { isIsoDate, normalizePhone } from "@/lib/constants";

const blank = (max: number) => z.string().trim().max(max, "err_form").default("");

export const inquiryPayloadSchema = z.object({
  name: z.string().trim().min(1, "err_name").max(120, "err_form"),
  instagram: blank(80),
  wedding_date: blank(80),
  venue: blank(200),
  guests: blank(40),
  planner: blank(120),
  found_on: blank(120),
  contact: z.string().trim().min(1, "err_form").max(200, "err_form"),
  fax: blank(200),
});

export type InquiryPayload = z.infer<typeof inquiryPayloadSchema>;

export function splitInquiryContact(value: string): { email: string | null; phone: string | null } | null {
  const text = value.trim();
  if (!text || text.length > 200) return null;
  if (text.includes("@")) {
    const email = text.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
    return { email, phone: null };
  }
  const phone = normalizePhone(text);
  if (!phone) return null;
  return { email: null, phone };
}

export function parseInquiryDate(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  if (isIsoDate(text)) return text;
  const match = /^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})$/.exec(text);
  if (!match) return null;
  const iso = `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  return isIsoDate(iso) ? iso : null;
}
