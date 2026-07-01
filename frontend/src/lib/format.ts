export const pct = (n: number, d = 0) => `${(n * 100).toFixed(d)}%`;
export const pp  = (n: number) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(1)}pp`;
export const usd = (n: number, d = 2) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
export const compact = (n: number): string => {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};
export const timeAgo = (iso: string | number | Date) => {
  const ts = new Date(iso).getTime();
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)    return `hace ${s}s`;
  if (s < 3600)  return `hace ${Math.floor(s / 60)}m`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)}h`;
  return `hace ${Math.floor(s / 86400)}d`;
};
export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// Normaliza un texto a un slug válido para IDs de mercado: minúsculas, sin
// acentos, solo [a-z0-9-], sin guiones al borde, hasta 64 chars.
export const slugify = (s: string): string =>
  (s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

// Spanish labels for Market lifecycle status
const MARKET_STATUS_ES: Record<string, string> = {
  OPEN: "Abierto",
  CLOSED: "Cerrado",
  PROPOSED: "En revisión",
  DISPUTED: "Disputado",
  RESOLVED: "Resuelto",
  VOIDED: "Nulo",
};
export const statusEs = (s: string | null | undefined) =>
  s ? (MARKET_STATUS_ES[s] ?? s) : "";

// Spanish labels for Market resolved outcome
const OUTCOME_ES: Record<string, string> = {
  YES: "SÍ",
  NO: "NO",
  VOID: "NULO",
};
export const outcomeEs = (s: string | null | undefined) =>
  s ? (OUTCOME_ES[s] ?? s) : "";
