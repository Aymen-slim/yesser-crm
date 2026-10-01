export type ContractBlanks = {
  client_names: string;
  contact: string;
  address: string;
  event_date: string;
  places: string;
  schedule: string;
  start_time: string;
  end_time: string;
  preparations: string;
  pack: "" | "1" | "2" | "3";
  pack1_name: string;
  pack1_lines: string;
  pack1_price: string;
  pack2_name: string;
  pack2_lines: string;
  pack2_price: string;
  pack3_name: string;
  pack3_lines: string;
  pack3_price: string;
  extras: string;
  total: string;
  deposit: string;
  balance: string;
  signed_place: string;
  signed_day: string;
  signed_month: string;
};

export type ScheduleRow = { date: string; place: string };

export const CONTRACT_PACKS = [
  {
    id: "1" as const,
    choice: "Pack 1 — Essential",
    name: "PACK 1 — ESSENTIAL",
    price: "3 500 DT",
    lines: [
      "Préparatifs · Shooting extérieur · Couverture photo complète du mariage ·",
      "500+ photos retouchées HD · Vidéo clip cinématique (2–3 min) · Galerie en",
      "ligne privée · Mini Photobook",
    ].join("\n"),
  },
  {
    id: "2" as const,
    choice: "Pack 2 — Signature",
    name: "PACK 2 — SIGNATURE",
    price: "4 500 DT",
    lines: [
      "Préparatifs · Shooting extérieur · Couverture photo complète du mariage ·",
      "800+ photos retouchées HD · Vidéo clip cinématique (2–3 min) · Vidéo Reel ·",
      "Vidéo continue documentaire de la soirée · Galerie en ligne privée · Tirage de",
      "50 photos · Photobook",
    ].join("\n"),
  },
  {
    id: "3" as const,
    choice: "Pack 3 — Premium",
    name: "PACK 3 — PREMIUM",
    price: "5 500 DT",
    lines: [
      "Shooting extérieur · Préparatifs · Couverture photo complète du mariage ·",
      "Photos illimitées retouchées HD · Vidéo clip cinématique (2–3 min) · 2 Vidéos",
      "Reel · Vidéo continue documentaire (2 Cam) · Vidéo Guest Messages ·",
      "Galerie en ligne privée · Tirage de 100 photos · Photobook Luxe",
    ].join("\n"),
  },
];

export function packFields(): Pick<
  ContractBlanks,
  | "pack1_name"
  | "pack1_lines"
  | "pack1_price"
  | "pack2_name"
  | "pack2_lines"
  | "pack2_price"
  | "pack3_name"
  | "pack3_lines"
  | "pack3_price"
> {
  return {
    pack1_name: CONTRACT_PACKS[0].name,
    pack1_lines: CONTRACT_PACKS[0].lines,
    pack1_price: CONTRACT_PACKS[0].price,
    pack2_name: CONTRACT_PACKS[1].name,
    pack2_lines: CONTRACT_PACKS[1].lines,
    pack2_price: CONTRACT_PACKS[1].price,
    pack3_name: CONTRACT_PACKS[2].name,
    pack3_lines: CONTRACT_PACKS[2].lines,
    pack3_price: CONTRACT_PACKS[2].price,
  };
}

export function parseSchedule(value: string): ScheduleRow[] {
  if (!value.trim()) return [{ date: "", place: "" }];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [{ date: value, place: "" }];
    const rows = parsed
      .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
      .map((row) => ({
        date: typeof row.date === "string" ? row.date : "",
        place: typeof row.place === "string" ? row.place : "",
      }));
    return rows.length > 0 ? rows : [{ date: "", place: "" }];
  } catch {
    return [{ date: value, place: "" }];
  }
}

export function encodeSchedule(rows: ScheduleRow[]): string {
  const clean = rows.map((row) => ({ date: row.date, place: row.place }));
  return JSON.stringify(clean.length > 0 ? clean : [{ date: "", place: "" }]);
}

const KEYS = [
  "client_names",
  "contact",
  "address",
  "event_date",
  "places",
  "schedule",
  "start_time",
  "end_time",
  "preparations",
  "pack",
  "pack1_name",
  "pack1_lines",
  "pack1_price",
  "pack2_name",
  "pack2_lines",
  "pack2_price",
  "pack3_name",
  "pack3_lines",
  "pack3_price",
  "extras",
  "total",
  "deposit",
  "balance",
  "signed_place",
  "signed_day",
  "signed_month",
] as const;

export function readContractBlanks(raw: unknown, fallback: ContractBlanks): ContractBlanks {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fallback;
  const row = raw as Record<string, unknown>;
  const next = { ...fallback };
  for (const key of KEYS) {
    if (key === "pack" || typeof row[key] !== "string") continue;
    next[key] = row[key];
  }
  if (row.pack === "" || row.pack === "1" || row.pack === "2" || row.pack === "3") next.pack = row.pack;
  return next;
}

export function formatDt(millimes: number): string {
  const sign = millimes < 0 ? "-" : "";
  const abs = Math.abs(millimes);
  const whole = Math.floor(abs / 1000);
  const frac = abs % 1000;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  if (frac === 0) return `${sign}${grouped}`;
  return `${sign}${grouped},${String(frac).padStart(3, "0")}`;
}

export function guessPack(name: string | null | undefined): ContractBlanks["pack"] {
  const value = (name ?? "").toLowerCase();
  if (/premium|pack\s*3|forfait\s*3/.test(value)) return "3";
  if (/signature|pack\s*2|forfait\s*2/.test(value)) return "2";
  if (/essential|pack\s*1|forfait\s*1/.test(value)) return "1";
  return "";
}
