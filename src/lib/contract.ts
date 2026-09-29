export type ContractBlanks = {
  client_names: string;
  contact: string;
  address: string;
  event_date: string;
  places: string;
  start_time: string;
  end_time: string;
  preparations: string;
  pack: "" | "1" | "2" | "3";
  extras: string;
  total: string;
  deposit: string;
  balance: string;
  signed_place: string;
  signed_day: string;
  signed_month: string;
};

const KEYS = [
  "client_names",
  "contact",
  "address",
  "event_date",
  "places",
  "start_time",
  "end_time",
  "preparations",
  "pack",
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
