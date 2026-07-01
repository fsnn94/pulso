// Helpers para mercados binarios con etiquetas personalizables (Fase 1).
// Un mercado es "etiquetado" cuando sus lados no son el Sí/No estándar (ej.
// "Boca"/"River"); en ese caso la UI usa colores neutros (el color de Pulso)
// en vez de verde/rojo, que no representan a las opciones.

type Labeled = { yes_label?: string | null; no_label?: string | null };

const normalize = (s?: string | null) => (s ?? "").trim().toLowerCase();

export function isLabeledMarket(m: Labeled | undefined | null): boolean {
  if (!m) return false;
  const y = normalize(m.yes_label) || "sí";
  const n = normalize(m.no_label) || "no";
  const yesIsStd = y === "sí" || y === "si" || y === "yes";
  const noIsStd = n === "no";
  return !(yesIsStd && noIsStd);
}

export function sideLabel(m: Labeled | undefined | null, side: "YES" | "NO"): string {
  if (side === "YES") return (m?.yes_label && m.yes_label.trim()) || "Sí";
  return (m?.no_label && m.no_label.trim()) || "No";
}

/** Clase de color de texto para un lado. Etiquetado → color de Pulso (accent)
 *  para ambos; estándar → verde (YES) / rojo (NO). */
export function sideTextClass(m: Labeled | undefined | null, side: "YES" | "NO"): string {
  if (isLabeledMarket(m)) return "text-accent-500";
  return side === "YES" ? "text-yes-500" : "text-no-500";
}
