export function tndToMillimes(value: string): number {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,3})?$/.test(normalized)) {
    throw new Error("err_amount");
  }
  const [whole, frac = ""] = normalized.split(".");
  const millis = (frac + "000").slice(0, 3);
  return Number(whole) * 1000 + Number(millis);
}

export function formatTnd(millimes: number): string {
  const sign = millimes < 0 ? "-" : "";
  const abs = Math.abs(millimes);
  const whole = Math.floor(abs / 1000);
  const frac = String(abs % 1000).padStart(3, "0");
  return `${sign}${whole.toLocaleString("en-GB")}.${frac} TND`;
}

export function rateToBps(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, frac = ""] = normalized.split(".");
  const bps = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  if (bps < 1 || bps > 10000) return null;
  return bps;
}

export function formatRate(bps: number): string {
  const whole = Math.floor(bps / 100);
  const frac = bps % 100;
  if (!frac) return `${whole}%`;
  if (frac % 10 === 0) return `${whole}.${frac / 10}%`;
  return `${whole}.${String(frac).padStart(2, "0")}%`;
}

export function invoiceTotals(amountMillimes: number, mode: "none" | "added" | "included", bps: number) {
  if (mode === "none" || bps <= 0) return { ht: amountMillimes, tva: 0, ttc: amountMillimes };
  if (mode === "added") {
    const tva = Math.round((amountMillimes * bps) / 10000);
    return { ht: amountMillimes, tva, ttc: amountMillimes + tva };
  }
  const ht = Math.round((amountMillimes * 10000) / (10000 + bps));
  return { ht, tva: amountMillimes - ht, ttc: amountMillimes };
}
