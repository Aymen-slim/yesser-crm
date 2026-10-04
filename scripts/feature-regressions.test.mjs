import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cache = new Map();
function load(relative, overrides = {}, moduleCache = cache) {
  if (moduleCache === cache && Object.keys(overrides).length) moduleCache = new Map();
  const filename = resolve(root, relative);
  if (moduleCache.has(filename)) return moduleCache.get(filename);
  const loadedModule = { exports: {} };
  moduleCache.set(filename, loadedModule.exports);
  const nativeRequire = createRequire(filename);
  const require = (name) => {
    if (Object.hasOwn(overrides, name)) return overrides[name];
    if (name === "next/link") return function TestLink({ children, href, ...props }) {
      delete props.prefetch;
      return React.createElement("a", { ...props, href }, children);
    };
    if (name.startsWith("@/")) return load(`src/${name.slice(2)}.ts`, overrides, moduleCache);
    return nativeRequire(name);
  };
  const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: filename,
  });
  runInNewContext(outputText, { module: loadedModule, exports: loadedModule.exports, require, URLSearchParams }, { filename });
  moduleCache.set(filename, loadedModule.exports);
  return loadedModule.exports;
}

const { normalizePhone, monthRange, isIsoDate } = load("src/lib/constants.ts");
const { clientSchema, leadSchema, quickBookSchema, contractSchema, parseForm } = load("src/lib/validators.ts");
const { CalendarMonth } = load("src/components/calendar.tsx");
const { YesserContract } = load("src/components/yesser-contract.tsx");
const { packFields } = load("src/lib/contract.ts");
const { getMessages } = load("src/lib/i18n.ts");

test("Tunisian numbers remain supported and normalize for contact links", () => {
  for (const value of ["20123456", "20 123 456", "+216 20 123 456", "00216 20123456", "21620123456"]) {
    assert.equal(normalizePhone(value), "+21620123456", value);
  }
});

test("international numbers accept country codes and common separators", () => {
  const numbers = [
    ["+33 6 12 34 56 78", "+33612345678"],
    ["0033 6 12 34 56 78", "+33612345678"],
    ["+1 (202) 555-0123", "+12025550123"],
    ["+44 7911 123456", "+447911123456"],
    ["+971 50 123 4567", "+971501234567"],
    ["+49 151 23456789", "+4915123456789"],
  ];
  for (const [value, expected] of numbers) assert.equal(normalizePhone(value), expected, value);
});

test("invalid phone syntax and unqualified foreign numbers are rejected", () => {
  for (const value of ["", "0612345678", "+0123456789", "+33", "+2162012345", "+216201234567", "++33612345678", "+33abc612345678", "+33 612345678 ext 2", "+1234567890123456", "tel:+33612345678", "javascript:alert(1)"]) {
    assert.equal(normalizePhone(value), null, value);
  }
});

test("all couple creation paths validate and retain a separate WhatsApp number", () => {
  const data = { partner_one_name: "Test", phone: "+33 6 12 34 56 78", whatsapp_phone: "+44 7911 123456", source: "instagram", status: "new", wedding_date: "2027-06-12" };
  for (const schema of [clientSchema, leadSchema, quickBookSchema]) {
    const parsed = schema.parse(data);
    assert.equal(parsed.phone, "+33612345678");
    assert.equal(parsed.whatsapp_phone, "+447911123456");
    assert.equal(schema.safeParse({ ...data, whatsapp_phone: "invalid" }).success, false);
    for (const value of [undefined, "", "   "]) {
      assert.equal(schema.parse({ ...data, whatsapp_phone: value }).whatsapp_phone, "");
    }
  }
});

test("server form parsing applies phone validation rather than trusting the browser", () => {
  const form = new FormData();
  form.set("partner_one_name", "Test");
  form.set("phone", "0033 6 12 34 56 78");
  assert.equal(parseForm(clientSchema, form).data.phone, "+33612345678");
  form.set("whatsapp_phone", "invalid");
  assert.equal(parseForm(clientSchema, form).error, "err_phone");
});

test("calendar month boundaries handle leap years and December rollover", () => {
  assert.equal(monthRange(2028, 2).days, 29);
  assert.equal(monthRange(2027, 2).days, 28);
  assert.equal(monthRange(2026, 12).end, "2027-01-01");
});

test("calendar quick booking rejects impossible dates", () => {
  for (const date of ["2027-02-29", "2026-02-30", "2026-13-01", "2026-06-31", "2026-01-00"]) {
    assert.equal(isIsoDate(date), false, date);
    assert.equal(quickBookSchema.safeParse({ partner_one_name: "Test", phone: "20123456", wedding_date: date }).success, false);
  }
  assert.equal(isIsoDate("2028-02-29"), true);
});

const calendarProps = {
  month: "2027-06", days: 30, leadingBlanks: 1, todayDay: 12, addDate: null,
  weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], admin: true, locale: "en",
  labels: getMessages("en").calendar,
  events: { 12: [
    { id: "first", name: "A long couple name & partner name", time: "10:00", venue: "First venue" },
    { id: "second", name: "Another couple", time: "18:00", venue: "Second venue" },
  ] },
};

test("mobile calendar exposes all selected-day bookings and touch controls", () => {
  const html = renderToStaticMarkup(React.createElement(CalendarMonth, calendarProps));
  assert.ok(html.includes("calendar-day-agenda"));
  assert.ok(html.includes('aria-current="date"'));
  assert.ok(html.includes('aria-pressed="true"'));
  assert.ok(html.includes("Double booked"));
  assert.ok(html.includes("First venue") && html.includes("Second venue"));
  assert.ok(html.includes("/weddings/first") && html.includes("/weddings/second"));
  assert.ok(html.includes("add=2027-06-12#quick-booking"));
  assert.ok(!html.includes("min-w-[640px]"));
});

test("member calendar keeps booking controls hidden and shows empty days", () => {
  const html = renderToStaticMarkup(React.createElement(CalendarMonth, { ...calendarProps, admin: false, events: {} }));
  assert.ok(html.includes(calendarProps.labels.emptyDay));
  assert.ok(!html.includes("#quick-booking"));
});

test("contract package fields mirror complete text for auto-sizing and printing", () => {
  const longText = Array.from({ length: 12 }, (_, index) => `Prestation ${index + 1} avec une description longue`).join("\n");
  const initial = { ...contractSchema.parse({ wedding_id: "12345678-1234-4234-8234-123456789012" }), ...packFields(), pack1_lines: `${longText}\n<script>not executable</script>` };
  const html = renderToStaticMarkup(React.createElement(YesserContract, { weddingId: initial.wedding_id, initial, saveAction: () => {} }));
  assert.equal((html.match(/class="auto-cell"/g) ?? []).length, 9);
  assert.ok(html.includes("Prestation 12"));
  assert.ok(html.includes("&lt;script&gt;not executable&lt;/script&gt;"));
  assert.ok(html.includes(".cell-size { visibility: visible; }"));
  assert.ok(html.includes("@page { size: A4; margin: 0; }"));
  assert.ok(!html.includes('rows="4"'));
});

test("error page renders on the server without browser globals", () => {
  const { default: StudioError } = load("src/app/(studio)/error.tsx");
  const error = Object.assign(new Error("Test failure"), { digest: "test-reference" });
  const html = renderToStaticMarkup(React.createElement(StudioError, { error, retry: () => {} }));
  assert.ok(html.includes(getMessages("en").errors.title));
  assert.ok(html.includes(getMessages("en").errors.retry));
  assert.ok(html.includes("test-reference"));
});

function weddingPageFixture({ whatsappEnabled = false, weddingError = null, missing = false } = {}) {
  const client = { id: "client-id", partner_one_name: "Test", partner_two_name: "Partner", phone: "+33612345678" };
  const wedding = { id: "wedding-id", client_id: client.id, wedding_date: "2027-06-12", status: "reserved", total_millimes: 0, clients: [client], packages: [] };
  const queries = [];
  const supabase = {
    from(table) {
      const query = {
        columns: "",
        select(columns) { this.columns = columns; queries.push({ table, columns }); return this; },
        eq() { return this; },
        neq() { return this; },
        order() { return this; },
        in() { return this; },
        async maybeSingle() {
          if (weddingError) return { data: null, error: weddingError };
          if (!whatsappEnabled && this.columns.includes("whatsapp_phone")) return { data: null, error: { code: "42703", message: "column clients.whatsapp_phone does not exist" } };
          return { data: missing ? null : { ...wedding, clients: [{ ...client, ...(whatsappEnabled ? { whatsapp_phone: "+447911123456" } : {}) }] }, error: null };
        },
        then(resolve) {
          if (table === "clients" && this.columns.includes("whatsapp_phone")) {
            return Promise.resolve(whatsappEnabled
              ? { data: [{ id: client.id, whatsapp_phone: "+447911123456" }], error: null }
              : { data: null, error: { code: "42703", message: "column clients.whatsapp_phone does not exist" } }).then(resolve);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve);
        },
      };
      return query;
    },
  };
  function TestComponent() { return null; }
  const components = new Proxy({}, { get: (_, name) => name === "coupleName" ? (one, two) => `${one} & ${two}` : TestComponent });
  const { default: WeddingPage } = load("src/app/(studio)/weddings/[id]/page.tsx", {
    "next/navigation": { notFound() { throw new Error("TEST_NOT_FOUND"); } },
    "@/components/client": components,
    "@/components/record-forms": components,
    "@/components/ui": components,
    "@/lib/actions": {},
    "@/lib/auth": { requireUser: async () => ({ id: "admin-id", role: "admin" }) },
    "@/lib/locale": { getLocale: async () => "en" },
    "@/lib/supabase/server": { createClient: async () => supabase },
  });
  return {
    render: () => WeddingPage({ params: Promise.resolve({ id: wedding.id }), searchParams: Promise.resolve({}) }),
    queries,
  };
}

function findElement(node, predicate) {
  if (Array.isArray(node)) return node.map((item) => findElement(item, predicate)).find(Boolean);
  if (!node || typeof node !== "object") return null;
  if (predicate(node)) return node;
  return findElement(node.props?.children, predicate);
}

test("existing wedding opens when optional WhatsApp column has not been migrated", async () => {
  const fixture = weddingPageFixture();
  const element = await fixture.render();
  assert.ok(element);
  assert.ok(findElement(element, (node) => node.props?.phone === "+33612345678"));
});

test("wedding retains its WhatsApp link after the database migration", async () => {
  const fixture = weddingPageFixture({ whatsappEnabled: true });
  const element = await fixture.render();
  assert.ok(findElement(element, (node) => node.props?.whatsappPhone === "+447911123456"));
});

test("genuinely missing wedding still returns not-found", async () => {
  await assert.rejects(weddingPageFixture({ missing: true }).render(), { message: "TEST_NOT_FOUND" });
});

test("wedding query failure is not reported as a missing record", async () => {
  await assert.rejects(weddingPageFixture({ weddingError: { code: "XX000", message: "Database unavailable" } }).render(), { message: "wedding_failed" });
});

test("optional contact fallback applies only to the missing WhatsApp column", () => {
  const { isMissingWhatsappColumn } = load("src/lib/supabase/contacts.ts");
  assert.equal(isMissingWhatsappColumn({ code: "42703", message: "column clients.whatsapp_phone does not exist" }), true);
  assert.equal(isMissingWhatsappColumn({ code: "PGRST204", message: "Could not find the 'whatsapp_phone' column in the schema cache" }), true);
  assert.equal(isMissingWhatsappColumn({ code: "42703", message: "column packages.features does not exist" }), false);
  assert.equal(isMissingWhatsappColumn({ code: "42501", message: "permission denied for column whatsapp_phone" }), false);
});

function contactLookup(result) {
  return {
    from(table) {
      assert.ok(table === "clients" || table === "leads");
      return {
        select(columns) {
          assert.equal(columns, "id, whatsapp_phone");
          return { in(column, ids) {
            assert.equal(column, "id");
            assert.deepEqual(ids, ["client-id"]);
            return Promise.resolve(result);
          } };
        },
      };
    },
  };
}

test("contact lookup does not fetch unrelated clients for an empty list", async () => {
  const { getWhatsappPhones } = load("src/lib/supabase/contacts.ts");
  const result = await getWhatsappPhones({ from() { assert.fail("No query should be made"); } }, "clients", []);
  assert.equal(result.size, 0);
});

test("optional contact lookup works before and after migration", async () => {
  const { getWhatsappPhones } = load("src/lib/supabase/contacts.ts");
  const before = await getWhatsappPhones(contactLookup({ data: null, error: { code: "42703", message: "column clients.whatsapp_phone does not exist" } }), "clients", ["client-id"]);
  assert.equal(before.size, 0);
  const after = await getWhatsappPhones(contactLookup({ data: [{ id: "client-id", whatsapp_phone: "+447911123456" }], error: null }), "clients", ["client-id"]);
  assert.equal(after.get("client-id"), "+447911123456");
});

test("optional contact lookup does not hide database permission failures", async () => {
  const { getWhatsappPhones } = load("src/lib/supabase/contacts.ts");
  await assert.rejects(getWhatsappPhones(contactLookup({ data: null, error: { code: "42501", message: "permission denied for column whatsapp_phone" } }), "clients", ["client-id"]), { message: "couple_contacts_failed" });
});

function couplesPageFixture(tab) {
  const record = { id: "client-id", partner_one_name: "Test", partner_two_name: "Partner", phone: "+33612345678", email: null, city: "Test city", weddings: [{ wedding_date: "2027-06-12" }], source: "instagram", status: "new", wedding_date: "2027-06-12" };
  const supabase = {
    from(table) {
      return {
        columns: "", head: false,
        select(columns, options = {}) { this.columns = columns; this.head = options.head; return this; },
        in() { return this; }, eq() { return this; }, order() { return this; }, range() { return this; }, overrideTypes() { return this; },
        then(resolve) {
          if (this.columns.includes("whatsapp_phone")) return Promise.resolve({ data: null, error: { code: "42703", message: "column clients.whatsapp_phone does not exist" }, count: null }).then(resolve);
          return Promise.resolve({ data: this.head ? null : table === "packages" ? [] : [record], error: null, count: 1 }).then(resolve);
        },
      };
    },
  };
  function TestComponent() { return null; }
  const components = new Proxy({}, { get: (_, name) => name === "coupleName" ? (one, two) => `${one} & ${two}` : TestComponent });
  const { default: CouplesPage } = load("src/app/(studio)/clients/page.tsx", {
    "@/components/record-forms": components,
    "@/components/ui": components,
    "@/lib/auth": { requireAdmin: async () => ({ id: "admin-id", role: "admin" }) },
    "@/lib/locale": { getLocale: async () => "en" },
    "@/lib/supabase/server": { createClient: async () => supabase },
  });
  return CouplesPage({ searchParams: Promise.resolve({ tab }) });
}

test("booked couples and leads remain visible before the WhatsApp migration", async () => {
  for (const tab of ["booked", "leads"]) {
    const element = await couplesPageFixture(tab);
    assert.ok(findElement(element, (node) => node.props?.phone === "+33612345678"), tab);
  }
});
