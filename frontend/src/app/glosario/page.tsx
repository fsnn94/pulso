import type { ReactNode } from "react";
import Link from "next/link";
import { DocArticle, DocNote } from "@/components/DocPage";

export const metadata = { title: "Glosario — Pulso" };

const TERMS: { term: string; def: ReactNode }[] = [
  { term: "Mercado", def: "Una pregunta de resultado binario (SÍ/NO) sobre un evento futuro, con fecha de cierre y fuente de resolución." },
  { term: "Contrato SÍ / NO", def: "La unidad que se opera. Un contrato del lado ganador se liquida a 100¢; el perdedor, a 0¢." },
  { term: "Precio (¢)", def: "El precio del contrato SÍ, entre 1¢ y 99¢. Se lee como la probabilidad implícita del evento. El NO vale 1 − precio SÍ." },
  { term: "Probabilidad implícita", def: "La lectura del precio como porcentaje: un SÍ a 70¢ implica ~70% de probabilidad según el consenso del mercado." },
  { term: "Orden a mercado", def: "Compra o venta inmediata al mejor precio disponible en el libro. Puede pagar slippage si es grande." },
  { term: "Orden a límite", def: "Orden que solo se ejecuta a un precio igual o mejor que el que fijás. Queda en el libro hasta cruzarse o cancelarse." },
  { term: "Libro de órdenes", def: "El conjunto de órdenes a límite de compra y venta de cada lado, ordenadas por precio." },
  { term: "Spread", def: "La diferencia entre la mejor compra y la mejor venta. Más angosto = mercado más eficiente." },
  { term: "Slippage", def: "El costo de mover el precio cuando tu orden supera la liquidez del mejor nivel. Pulso lo modela explícitamente." },
  { term: "Liquidez", def: "El interés abierto disponible para operar. Más liquidez implica precios más estables." },
  { term: "Volumen 24h", def: "El nocional operado (precio × cantidad) en las últimas 24 horas." },
  { term: "Posición", def: "Tu tenencia neta de contratos SÍ o NO en un mercado, con su costo promedio." },
  { term: "Patrimonio (equity)", def: "Tu efectivo más el valor de mercado de tus posiciones abiertas al precio actual." },
  { term: "P&L no realizado", def: "Ganancia o pérdida latente de tus posiciones abiertas frente a su costo." },
  { term: "P&L realizado", def: "Ganancia o pérdida ya materializada al cerrar o resolver, neta de comisión." },
  { term: "Comisión", def: "Fee de la casa (por defecto 5%) que se cobra solo sobre cada ganancia realizada." },
  { term: "Resolución", def: "El proceso por el que un mercado obtiene su resultado final (SÍ, NO o Nulo)." },
  { term: "Nulo (VOID)", def: "Cierre de un mercado cancelado o ambiguo: cada posición se reembolsa a su costo promedio." },
  { term: "Ventana de desafío", def: "El período (por defecto 24h) durante el cual se puede disputar un resultado propuesto antes de que se finalice." },
  { term: "KYC", def: "\"Conocé a tu cliente\": datos identificatorios opcionales (nombre, país, documento, fecha de nacimiento)." },
  { term: "AML", def: "Prevención de lavado de activos: el motor de reglas que monitorea patrones sospechosos de operatoria." },
];

export default function GlosarioPage() {
  return (
    <DocArticle
      eyebrow="Recursos"
      title="Glosario"
      intro="Los términos que vas a encontrar operando en Pulso, en una línea cada uno."
    >
      <dl className="mt-10 divide-y divide-ink-100 dark:divide-ink-800">
        {TERMS.map((t) => (
          <div key={t.term} className="py-3 sm:grid sm:grid-cols-[200px_1fr] sm:gap-4">
            <dt className="font-semibold text-sm">{t.term}</dt>
            <dd className="text-sm text-ink-600 dark:text-ink-300 mt-0.5 sm:mt-0">{t.def}</dd>
          </div>
        ))}
      </dl>

      <DocNote>
        Para ver cómo encajan estos conceptos, mirá la <Link href="/metodologia">metodología</Link>{" "}
        o <Link href="/como-funciona">cómo funciona</Link>.
      </DocNote>
    </DocArticle>
  );
}
