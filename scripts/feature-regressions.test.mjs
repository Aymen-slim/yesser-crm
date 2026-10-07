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
  runInNewContext(outputText, { module: loadedModule, exports: loadedModule.exports, require, URLSearchParams, process }, { filename });
  moduleCache.set(filename, loadedModule.exports);
  return loadedModule.exports;
}

const { normalizePhone, monthRange, isIsoDate, resolveDashboardPeriod, sortByWeddingDate, dashboardPeriodInRange } = load("src/lib/constants.ts");
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

test("dashboard period accepts a month, a year, or a specific date", () => {
  const today = "2026-10-06";
  const month = resolveDashboardPeriod("month", "2024-03", today, "en");
  assert.equal(month.view, "month");
  assert.equal(month.start, "2024-03-01");
  assert.equal(month.end, "2024-04-01");
  assert.equal(month.days, 31);
  assert.equal(month.isCurrent, false);
  assert.equal(resolveDashboardPeriod("month", "nope", today).key, "2026-10");
  const year = resolveDashboardPeriod("year", "2025", today);
  assert.equal(year.start, "2025-01-01");
  assert.equal(year.end, "2026-01-01");
  assert.equal(resolveDashboardPeriod("year", "1800", today).key, "2026");
  const day = resolveDashboardPeriod("day", "2027-02-29", today);
  assert.equal(day.key, "2026-10-06");
  const leap = resolveDashboardPeriod("day", "2028-02-29", today);
  assert.equal(leap.start, "2028-02-29");
  assert.equal(leap.end, "2028-03-01");
  assert.equal(dashboardPeriodInRange("year", "1969"), false);
  assert.equal(dashboardPeriodInRange("month", "2024-03"), true);
});

test("wedding dates sort nearest, farthest, and oldest", () => {
  const rows = [
    { id: "a", wedding_date: "2026-01-01" },
    { id: "b", wedding_date: "2026-10-20" },
    { id: "c", wedding_date: "2026-10-06" },
    { id: "d", wedding_date: "2027-06-01" },
  ];
  const ids = (sort) => sortByWeddingDate(rows, sort, "2026-10-06").map((row) => row.id).join(",");
  assert.equal(ids("nearest"), "c,b,d,a");
  assert.equal(ids("farthest"), "d,b,c,a");
  assert.equal(ids("oldest"), "a,c,b,d");
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

function weddingPageFixture({ whatsappEnabled = false, weddingError = null, missing = false, role = "admin" } = {}) {
  const client = { id: "client-id", partner_one_name: "Test", partner_two_name: "Partner", phone: "+33612345678" };
  const wedding = { id: "wedding-id", client_id: client.id, wedding_date: "2027-06-12", status: "reserved", total_millimes: 0, clients: [client], packages: [] };
  const queries = [];
  const supabase = {
    from(table) {
      const query = {
        columns: "",
        select(columns) { this.columns = columns; queries.push({ table, columns }); return this; },
        eq(column, value) { queries.push({ table, column, value }); return this; },
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
    "@/lib/auth": { requireUser: async () => ({ id: "user-id", role }), canManageCrm: (profile) => ["admin", "assistant"].includes(profile.role) },
    "@/lib/locale": { getLocale: async () => "en" },
    "@/lib/supabase/server": { createClient: async () => supabase },
  });
  return {
    render: () => WeddingPage({ params: Promise.resolve({ id: wedding.id }), searchParams: Promise.resolve({}) }),
    queries,
  };
}

function findElement(node, predicate, seen = new Set()) {
  if (Array.isArray(node)) return node.map((item) => findElement(item, predicate, seen)).find(Boolean);
  if (!node || typeof node !== "object" || seen.has(node)) return null;
  seen.add(node);
  if (predicate(node)) return node;
  if (!node.props || typeof node.props !== "object") return null;
  for (const value of Object.values(node.props)) {
    const found = findElement(value, predicate, seen);
    if (found) return found;
  }
  return null;
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
    "@/lib/auth": { requireManager: async () => ({ id: "admin-id", role: "admin" }) },
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

function authFixture(role, active = true) {
  const profile = { id: "user-id", role, full_name: "Test User", active };
  const events = [];
  const auth = load("src/lib/auth.ts", {
    react: { cache: (fn) => fn },
    "next/navigation": { redirect(path) { throw new Error(`REDIRECT:${path}`); } },
    "@/lib/supabase/server": { createClient: async () => ({
      auth: { getClaims: async () => ({ data: { claims: { sub: profile.id } } }), signOut: async () => events.push("signOut") },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile, error: null }) }) }) }),
    }) },
  });
  return { auth, events, profile };
}

async function withSupabaseEnv(callback) {
  const previous = { ...process.env };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-key";
  try { await callback(); }
  finally {
    for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test("assistants can manage CRM records but cannot pass the admin guard", async () => {
  await withSupabaseEnv(async () => {
    const { auth, profile } = authFixture("assistant");
    assert.equal(auth.canManageCrm(profile), true);
    assert.equal((await auth.requireManager()).role, "assistant");
    await assert.rejects(auth.requireAdmin(), { message: "REDIRECT:/weddings" });
    assert.equal((await authFixture("admin").auth.requireAdmin()).role, "admin");
    await assert.rejects(authFixture("member").auth.requireManager(), { message: "REDIRECT:/" });
  });
});

test("inactive assistants are signed out and unknown roles fail closed", async () => {
  await withSupabaseEnv(async () => {
    const { auth, events } = authFixture("assistant", false);
    await assert.rejects(auth.requireManager(), { message: "REDIRECT:/login?error=account_inactive" });
    assert.deepEqual(events, ["signOut"]);
    const unknown = authFixture("unknown");
    assert.equal(unknown.auth.canManageCrm({ role: "unknown", active: true }), false);
    await assert.rejects(unknown.auth.requireUser(), { message: "REDIRECT:/login?error=account_inactive" });
  });
});

test("assistant role is validated for new accounts and role updates", () => {
  const { memberSchema, memberRoleSchema } = load("src/lib/validators.ts");
  assert.equal(memberSchema.parse({ full_name: "Test", role: "assistant" }).role, "assistant");
  assert.equal(memberSchema.parse({ full_name: "Test" }).role, "member");
  assert.equal(memberSchema.safeParse({ full_name: "Test", role: "admin" }).success, false);
  const id = "12345678-1234-4234-8234-123456789012";
  assert.equal(memberRoleSchema.safeParse({ id, role: "assistant" }).success, true);
  for (const role of ["admin", "unknown", ""]) assert.equal(memberRoleSchema.safeParse({ id, role }).success, false);
});

test("assistant dashboard requests redirect before any data is loaded", async () => {
  const { default: DashboardPage } = load("src/app/(studio)/page.tsx", {
    "next/navigation": { redirect(path) { throw new Error(`REDIRECT:${path}`); } },
    "@/components/chart": {}, "@/components/ui": {}, "@/components/client": {},
    "@/lib/auth": { requireUser: async () => ({ role: "assistant" }) },
    "@/lib/supabase/server": { createClient: async () => assert.fail("Dashboard data must not be queried") },
    "@/lib/locale": { getLocale: async () => assert.fail("Dashboard must redirect immediately") },
  });
  await assert.rejects(DashboardPage({ searchParams: Promise.resolve({}) }), { message: "REDIRECT:/weddings" });
});

test("assistant navigation includes CRM pages but excludes the dashboard", () => {
  const { Shell } = load("src/components/shell.tsx", {
    "@/components/client": { NavLinks: () => null, LanguageSwitcher: () => null, BottomNav: () => null },
    "@/components/ui": { LogoMark: () => null },
    "@/lib/actions": { signOut: () => {} },
    "@/lib/auth": { canManageCrm: (profile) => ["admin", "assistant"].includes(profile.role) },
  });
  const render = (role) => Shell({ profile: { id: "user", role, full_name: "Test" }, locale: "en", messages: getMessages("en"), children: null });
  const links = findElement(render("assistant"), (node) => node.props?.items)?.props.items;
  assert.deepEqual(Array.from(links, (link) => link.href), ["/clients", "/weddings", "/calendar", "/payments", "/expenses", "/packages", "/team"]);
  assert.ok(findElement(render("admin"), (node) => node.props?.items)?.props.items.some((link) => link.href === "/"));
  assert.deepEqual(Array.from(findElement(render("member"), (node) => node.props?.items)?.props.items, (link) => link.href), ["/", "/weddings", "/calendar"]);
});

test("assistants see all wedding tasks and payments while members remain restricted", async () => {
  const assistant = weddingPageFixture({ role: "assistant" });
  await assistant.render();
  assert.ok(assistant.queries.some((query) => query.table === "payments"));
  assert.ok(!assistant.queries.some((query) => query.table === "tasks" && query.column === "assignee_id"));
  const member = weddingPageFixture({ role: "member" });
  await member.render();
  assert.ok(!member.queries.some((query) => query.table === "payments"));
  assert.ok(member.queries.some((query) => query.table === "tasks" && query.column === "assignee_id" && query.value === "user-id"));
});

function actionsFixture(role, supabase = { from() { assert.fail("Unexpected database access"); } }) {
  const { auth, profile } = authFixture(role);
  const actions = load("src/lib/actions.ts", {
    "next/navigation": { redirect(path) { throw new Error(`REDIRECT:${path}`); } },
    "next/cache": { revalidatePath() {} },
    "next/headers": { cookies: async () => ({}) },
    "@/lib/auth": auth,
    "@/lib/supabase/server": { createClient: async () => supabase },
    "@/lib/supabase/admin": { createAdminClient() { assert.fail("Unexpected account-management access"); } },
  });
  return { actions, profile };
}

test("direct account-management actions stay admin-only", async () => {
  await withSupabaseEnv(async () => {
    const { actions } = actionsFixture("assistant");
    for (const name of ["createMember", "updateMember", "updateMemberRole", "grantMemberLogin", "updateMemberLogin", "deleteMember", "setMemberActive"]) {
      await assert.rejects(actions[name](new FormData()), { message: "REDIRECT:/weddings" }, name);
    }
  });
});

test("members cannot invoke management actions directly", async () => {
  await withSupabaseEnv(async () => {
    const { actions } = actionsFixture("member");
    for (const name of ["saveLead", "convertLead", "saveClient", "deleteClient", "savePackage", "deletePackage", "saveExtra", "deleteExtra", "saveWeddingOffer", "addWeddingExtra", "updateWeddingExtra", "removeWeddingExtra", "addWeddingDay", "removeWeddingDay", "addWeddingPlace", "removeWeddingPlace", "saveWeddingFeatures", "resetWeddingFeatures", "saveWedding", "deleteWedding", "savePayment", "deletePayment", "markPaymentPaid", "markPaymentUnpaid", "saveExpense", "deleteExpense", "saveInvoice", "saveContract", "resetContract", "assignMember", "updateAssignment", "unassignMember", "setCrewPaid", "deleteTask", "quickBook", "deleteWeddingFile"]) {
      await assert.rejects(actions[name](new FormData()), { message: "REDIRECT:/" }, name);
    }
  });
});

test("assistants can save couples and assign tasks to other members", async () => {
  await withSupabaseEnv(async () => {
    const inserts = [];
    const supabase = { from: (table) => ({ insert: async (row) => { inserts.push({ table, row }); return { error: null }; } }) };
    const { actions } = actionsFixture("assistant", supabase);
    const couple = new FormData();
    couple.set("partner_one_name", "Test");
    couple.set("phone", "20123456");
    await assert.rejects(actions.saveClient(couple), { message: "REDIRECT:/clients?tab=booked&notice=couple_added" });
    assert.equal(inserts[0].table, "clients");
    assert.equal(inserts[0].row.phone, "+21620123456");
    const task = new FormData();
    task.set("wedding_id", "12345678-1234-4234-8234-123456789012");
    task.set("assignee_id", "22345678-1234-4234-8234-123456789012");
    task.set("title", "Edit");
    await assert.rejects(actions.saveTask(task), /notice=task_added/);
    assert.equal(inserts[1].row.assignee_id, task.get("assignee_id"));
    await assert.rejects(actionsFixture("member", supabase).actions.saveTask(task), /notice=task_added/);
    assert.equal(inserts[2].row.assignee_id, "user-id");
  });
});

test("role updates cannot promote admins or downgrade existing admin accounts", async () => {
  await withSupabaseEnv(async () => {
    const filters = [];
    const query = {
      update(row) { assert.equal(row.role, "assistant"); return this; },
      eq(column, value) { filters.push([column, value]); return this; },
      neq(column, value) { filters.push([column, value]); return this; },
      select() { return this; },
      maybeSingle: async () => ({ data: null, error: null }),
    };
    const { actions } = actionsFixture("admin", { from: () => query });
    const form = new FormData();
    form.set("id", "12345678-1234-4234-8234-123456789012");
    form.set("role", "admin");
    await assert.rejects(actions.updateMemberRole(form), { message: "REDIRECT:/team?error=err_form" });
    assert.equal(filters.length, 0);
    form.set("role", "assistant");
    await assert.rejects(actions.updateMemberRole(form), /error=save_member_failed/);
    assert.deepEqual(filters, [["id", form.get("id")], ["role", "admin"]]);
  });
});

test("assistant team pages never load login credentials or expose account controls", async () => {
  const member = { id: "member-id", full_name: "Test Member", role: "member", job: "Photographer", active: true, has_login: true, member_rates: [] };
  function TestComponent() { return null; }
  const components = new Proxy({}, { get: () => TestComponent });
  const { default: TeamMemberPage } = load("src/app/(studio)/team/[id]/page.tsx", {
    "@/components/client": components, "@/components/ui": components, "@/lib/actions": {},
    "@/lib/auth": { requireManager: async () => ({ id: "assistant-id", role: "assistant" }) },
    "@/lib/locale": { getLocale: async () => "en" },
    "@/lib/queries": { ...load("src/lib/queries.ts"), memberJobs: async () => [] },
    "@/lib/supabase/server": { createClient: async () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: member }) }) }) }) }) },
    "@/lib/supabase/admin": { createAdminClient() { assert.fail("Assistants must not load auth account data"); } },
  });
  const page = await TeamMemberPage({ params: Promise.resolve({ id: member.id }), searchParams: Promise.resolve({}) });
  assert.ok(findElement(page, (node) => node.type === "fieldset" && node.props.disabled));
  assert.ok(!findElement(page, (node) => node.props?.title === getMessages("en").team.account));
});

test("assistant migration covers CRM tables without granting profile or admin privileges", () => {
  const sql = readFileSync(resolve(root, "supabase/migrations/20261004130000_assistant_role.sql"), "utf8");
  assert.match(sql, /alter type public\.app_role add value if not exists 'assistant'/);
  assert.match(sql, /role::text in \('admin', 'assistant'\) and active/);
  const tableList = sql.match(/foreach table_name in array array\[([\s\S]*?)\]/)[1];
  const tables = Array.from(tableList.matchAll(/'([a-z_]+)'/g), (match) => match[1]);
  assert.deepEqual(tables, ["clients", "leads", "weddings", "packages", "extras", "wedding_extras", "wedding_days", "wedding_locations", "wedding_assignments", "payments", "expenses", "tasks", "notes", "files", "member_rates", "assignment_pay", "invoices", "invoice_lines", "contracts"]);
  assert.ok(!sql.includes("function public.is_admin("));
  assert.ok(!/on public\.profiles/.test(sql));
  assert.equal((sql.match(/if not public\.can_manage_crm\(\) then/g) ?? []).length, 4);
  assert.equal((sql.match(/bucket_id = 'studio-files' and public\.can_manage_crm\(\)/g) ?? []).length, 3);
});

const payRows = [
  { member_id: "crew-a", role_on_day: "Photo", weddings: { id: "past", wedding_date: "2026-09-10", status: "confirmed", clients: { partner_one_name: "Past", partner_two_name: "Couple" } }, assignment_pay: [{ amount_millimes: 125000, paid_at: null }] },
  { member_id: "crew-a", role_on_day: "Photo", weddings: [{ id: "future", wedding_date: "2027-06-12", status: "reserved", clients: [{ partner_one_name: "Future", partner_two_name: "Couple" }] }], assignment_pay: { amount_millimes: 350000, paid_at: null } },
  { member_id: "crew-b", role_on_day: "Video", weddings: { id: "current", wedding_date: "2026-10-12", status: "confirmed", clients: null }, assignment_pay: [{ amount_millimes: 200000, paid_at: "2026-11-01" }] },
  { member_id: "crew-a", role_on_day: "Photo", weddings: { id: "old-paid", wedding_date: "2026-08-12", status: "delivered", clients: null }, assignment_pay: [{ amount_millimes: 75000, paid_at: "2026-10-01" }] },
  { member_id: "crew-a", role_on_day: "Photo", weddings: { id: "cancelled", wedding_date: "2026-10-20", status: "cancelled", clients: null }, assignment_pay: [{ amount_millimes: 999000, paid_at: null }] },
];

function crewLookup(rows = payRows, error = null, profileError = null, maxRows = Infinity) {
  const calls = [];
  const profiles = ["crew-a", "crew-b"].map((id) => ({ id, full_name: id, role: "member", active: true, has_login: false, job: "Photo", instagram: "", phone: null, member_rates: [] }));
  const supabase = {
    from(table) {
      calls.push(table);
      const filters = [];
      let start = 0, end = Infinity;
      const value = (row, column) => column.split(".").reduce((result, key) => (Array.isArray(result) ? result[0] : result)?.[key], row);
      const result = () => {
        const matched = (table === "profiles" ? profiles : rows).filter((row) => filters.every((filter) => filter(row)));
        return { data: matched.slice(start, Math.min(end + 1, start + maxRows)), count: matched.length, error: table === "profiles" ? profileError : typeof error === "function" ? error(start) : error };
      };
      const query = {
        select() { return this; }, order() { return this; },
        gte(column, limit) { filters.push((row) => value(row, column) >= limit); return this; },
        lt(column, limit) { filters.push((row) => value(row, column) < limit); return this; },
        neq(column, excluded) { filters.push((row) => value(row, column) !== excluded); return this; },
        eq(column, expected) { filters.push((row) => value(row, column) === expected); return this; },
        range(first, last) { start = first; end = last; return this; },
        maybeSingle: async () => ({ ...result(), data: result().data[0] ?? null }),
        then(resolve) { return Promise.resolve(result()).then(resolve); },
      };
      return query;
    },
  };
  return { supabase, calls };
}

async function teamPayPage(searchParams = {}, memberId, lookup = crewLookup()) {
  function TestComponent() { return null; }
  const components = new Proxy({}, { get: () => TestComponent });
  const { default: Page } = load(memberId ? "src/app/(studio)/team/[id]/page.tsx" : "src/app/(studio)/team/page.tsx", {
    "@/components/client": components, "@/components/ui": components, "@/lib/actions": {},
    "@/lib/auth": { requireManager: async () => ({ id: "admin-id", role: "admin" }) },
    "@/lib/constants": { ...load("src/lib/constants.ts"), todayInTunis: () => "2026-10-04" },
    "@/lib/locale": { getLocale: async () => "en" },
    "@/lib/supabase/server": { createClient: async () => lookup.supabase },
    "@/lib/supabase/admin": { createAdminClient() { assert.fail("No login should be loaded"); } },
  });
  return Page({ params: Promise.resolve({ id: memberId }), searchParams: Promise.resolve(searchParams) });
}

test("Team still-to-pay includes past and future unpaid assignments by default", async () => {
  const page = await teamPayPage();
  const balance = findElement(page, (node) => node.props?.label === getMessages("en").team.stillToPay);
  assert.equal(balance.props.value, load("src/lib/money.ts").formatTnd(475000));
  const member = await teamPayPage({}, "crew-a");
  assert.equal(findElement(member, (node) => node.props?.label === getMessages("en").team.stillToPay).props.value, balance.props.value);
});

test("explicit monthly Team and member views use the same wedding-date scope", async () => {
  const page = await teamPayPage({ month: "2026-10" });
  const format = load("src/lib/money.ts").formatTnd;
  assert.equal(findElement(page, (node) => node.props?.label === getMessages("en").team.stillToPay).props.value, format(0));
  const member = await teamPayPage({ month: "2026-10" }, "crew-a");
  assert.equal(findElement(member, (node) => node.props?.label === getMessages("en").team.earned).props.value, format(0));
});

test("crew query failures must not be displayed as zero balances", async () => {
  const queries = load("src/lib/queries.ts");
  const range = { start: "2026-10-01", end: "2026-11-01" };
  for (const code of ["42501", "XX000", "PGRST200"]) {
    await assert.rejects(queries.crewJobs(crewLookup([], { code }).supabase, range), { message: "crew_pay_failed" });
    await assert.rejects(queries.memberJobs(crewLookup([], { code }).supabase, range, "crew-a"), { message: "crew_pay_failed" });
  }
});

test("crew totals preserve stored pay and exclude cancelled weddings", async () => {
  const { crewJobs, payTotals } = load("src/lib/queries.ts");
  const jobs = await crewJobs(crewLookup().supabase, null);
  const totals = payTotals([...jobs.values()].flat());
  assert.equal(totals.total, 750000);
  assert.equal(totals.paid, 275000);
  assert.equal(totals.unpaid, 475000);
  assert.equal(totals.total, totals.paid + totals.unpaid);
});

test("all-wedding pay totals include assignments beyond the first database page", async () => {
  const { crewJobs, payTotals } = load("src/lib/queries.ts");
  const rows = Array.from({ length: 1005 }, (_, index) => ({ ...payRows[0], weddings: { ...payRows[0].weddings, id: `job-${index}` }, assignment_pay: [{ amount_millimes: 1000, paid_at: null }] }));
  const jobs = await crewJobs(crewLookup(rows).supabase, null);
  assert.equal(payTotals([...jobs.values()].flat()).unpaid, 1005000);
});

const payWeddingId = "12345678-1234-4234-8234-123456789012";
const payMemberId = "22345678-1234-4234-8234-123456789012";

function crewPaidFixture(error = null, missing = false) {
  const stored = { amount_millimes: 350000, paid_at: null };
  let upserts = 0;
  const supabase = { from: (table) => {
    assert.equal(table, "assignment_pay");
    const query = {
      update(row) { if (!error && !missing) Object.assign(stored, row); return this; },
      select() { return this; }, eq() { return this; },
      maybeSingle: async () => ({ data: error || missing ? null : stored, error }),
      upsert: async (row) => { upserts++; Object.assign(stored, row); return { error: null }; },
    };
    return query;
  } };
  const form = new FormData();
  form.set("wedding_id", payWeddingId);
  form.set("member_id", payMemberId);
  form.set("paid", "true");
  return { stored, form, supabase, upserts: () => upserts };
}

test("marking crew paid and undoing changes only payment status, never the agreed amount", async () => {
  await withSupabaseEnv(async () => {
    const fixture = crewPaidFixture();
    const { actions } = actionsFixture("admin", fixture.supabase);
    await assert.rejects(actions.setCrewPaid(fixture.form), /notice=marked_paid/);
    assert.ok(fixture.stored.paid_at);
    assert.equal(fixture.stored.amount_millimes, 350000);
    fixture.form.set("paid", "false");
    await assert.rejects(actions.setCrewPaid(fixture.form), /notice=marked_unpaid/);
    assert.equal(fixture.stored.paid_at, null);
    assert.equal(fixture.stored.amount_millimes, 350000);
    assert.equal(fixture.upserts(), 0);
  });
});

test("missing or failed crew-pay updates cannot overwrite amounts with zero", async () => {
  await withSupabaseEnv(async () => {
    for (const fixture of [crewPaidFixture({ code: "XX000" }), crewPaidFixture(null, true)]) {
      await assert.rejects(actionsFixture("admin", fixture.supabase).actions.setCrewPaid(fixture.form), /error=pay_update_failed/);
      assert.equal(fixture.stored.amount_millimes, 350000);
      assert.equal(fixture.upserts(), 0);
    }
  });
});

test("crew payment status validates IDs and the paid flag before querying", async () => {
  await withSupabaseEnv(async () => {
    const { actions } = actionsFixture("admin");
    const fixture = crewPaidFixture();
    fixture.form.set("paid", "unexpected");
    await assert.rejects(actions.setCrewPaid(fixture.form), /error=pay_update_failed/);
    fixture.form.set("paid", "true");
    fixture.form.set("member_id", "invalid");
    await assert.rejects(actions.setCrewPaid(fixture.form), /error=pay_update_failed/);
  });
});

test("replacing a paid crew member does not mark their replacement as paid", async () => {
  await withSupabaseEnv(async () => {
    for (const replace of [true, false]) {
      let savedPay;
      const supabase = { from: (table) => ({
        select() { return this; }, eq() { return this; }, delete() { return this; }, update() { return this; },
        then(resolve) { return Promise.resolve({ error: null }).then(resolve); },
        maybeSingle: async () => ({ data: table === "profiles" ? { job: "Photo" } : table === "assignment_pay" ? { amount_millimes: 350000, paid_at: "2026-10-01" } : null, error: null }),
        insert: async () => ({ error: null }),
        upsert: async (row) => { savedPay = row; return { error: null }; },
      }) };
      const form = new FormData();
      form.set("wedding_id", payWeddingId);
      form.set("previous_member_id", payMemberId);
      form.set("member_id", replace ? "32345678-1234-4234-8234-123456789012" : payMemberId);
      await assert.rejects(actionsFixture("admin", supabase).actions.updateAssignment(form), /notice=assignment_saved/);
      assert.equal(savedPay.amount_millimes, 350000);
      assert.equal(savedPay.paid_at, replace ? null : "2026-10-01");
    }
  });
});

test("pay pagination handles lower database row limits and never returns partial totals on error", async () => {
  const { crewJobs, payTotals } = load("src/lib/queries.ts");
  const rows = Array.from({ length: 7 }, (_, index) => ({ ...payRows[0], weddings: { ...payRows[0].weddings, id: `job-${index}` } }));
  const jobs = await crewJobs(crewLookup(rows, null, null, 2).supabase, null);
  assert.equal(payTotals([...jobs.values()].flat()).unpaid, 875000);
  await assert.rejects(crewJobs(crewLookup(rows, (offset) => offset > 0 ? { code: "XX000" } : null, null, 2).supabase, null), { message: "crew_pay_failed" });
});

test("monthly pay uses inclusive start, exclusive end, and preserves zero agreed amounts", async () => {
  const { crewJobs, payTotals } = load("src/lib/queries.ts");
  const rows = ["2026-10-01", "2026-10-31", "2026-11-01"].map((date, index) => ({ ...payRows[0], weddings: { ...payRows[0].weddings, id: `job-${index}`, wedding_date: date }, assignment_pay: [{ amount_millimes: index === 0 ? 0 : 125000, paid_at: null }] }));
  const jobs = await crewJobs(crewLookup(rows).supabase, { start: "2026-10-01", end: "2026-11-01" });
  assert.equal(jobs.get("crew-a").length, 2);
  assert.equal(jobs.get("crew-a")[0].pay, 0);
  assert.equal(payTotals([...jobs.values()].flat()).unpaid, 125000);
});

test("a manager can mark a paid installment unpaid from the list or the edit form", async () => {
  await withSupabaseEnv(async () => {
    const paymentId = "32345678-1234-4234-8234-123456789012";
    const stored = { id: paymentId, wedding_id: payWeddingId, amount_millimes: 500000, paid_at: "2026-10-01", method: "cash" };
    const supabase = { from: (table) => {
      assert.equal(table, "payments");
      return {
        update(row) { Object.assign(stored, row); return this; },
        select() { return this; },
        eq() { return this; },
        maybeSingle: async () => ({ data: stored, error: null }),
      };
    } };
    const { actions } = actionsFixture("admin", supabase);
    const form = new FormData();
    form.set("id", paymentId);
    await assert.rejects(actions.markPaymentUnpaid(form), /notice=payment_unpaid/);
    assert.equal(stored.paid_at, null);
    assert.equal(stored.method, null);
    assert.equal(stored.amount_millimes, 500000);

    const edit = new FormData();
    edit.set("id", paymentId);
    edit.set("wedding_id", payWeddingId);
    edit.set("label", "Deposit");
    edit.set("amount", "500.000");
    edit.set("paid_at", "2026-10-01");
    edit.set("method", "cash");
    await assert.rejects(actions.savePayment(edit), /notice=payment_saved/);
    assert.equal(stored.paid_at, "2026-10-01");
    assert.equal(stored.method, "cash");
    assert.equal(stored.amount_millimes, 500000);

    edit.set("method", "");
    await assert.rejects(actions.savePayment(edit), /notice=payment_saved/);
    assert.equal(stored.paid_at, null);
    assert.equal(stored.method, null);
    assert.equal(stored.amount_millimes, 500000);

    edit.set("paid_at", "2026-10-01");
    edit.set("method", "cash");
    await assert.rejects(actions.savePayment(edit), /notice=payment_saved/);
    edit.set("paid_at", "");
    await assert.rejects(actions.savePayment(edit), /notice=payment_saved/);
    assert.equal(stored.paid_at, null);
    assert.equal(stored.method, null);
    assert.equal(stored.amount_millimes, 500000);

    form.set("id", "not-a-uuid");
    await assert.rejects(actions.markPaymentUnpaid(form), /error=update_payment_failed/);
  });
});

test("Team profile failures show an error rather than an empty list or not-found", async () => {
  for (const memberId of [undefined, "crew-a"]) {
    await assert.rejects(teamPayPage({}, memberId, crewLookup([], null, { code: "XX000" })), { message: "team_failed" });
  }
});

test("Team month navigation and member links preserve the selected monthly view", async () => {
  const page = await teamPayPage({ month: "2026-09" });
  const header = findElement(page, (node) => node.props?.title === getMessages("en").team.title);
  assert.equal(header.props.action.props.currentHref, "/team?view=month");
  assert.ok(findElement(page, (node) => node.props?.href === "/team/crew-a?month=2026-09"));
  const member = await teamPayPage({ month: "2026-09" }, "crew-a");
  assert.ok(findElement(member, (node) => node.props?.back?.href === "/team?month=2026-09"));
  assert.ok(findElement(member, (node) => node.props?.currentHref === "/team/crew-a?view=month"));
});
