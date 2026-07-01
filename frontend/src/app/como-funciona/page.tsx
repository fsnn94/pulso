import Link from "next/link";
import { FaqAccordion, FaqItem } from "@/components/FaqAccordion";

export const metadata = {
  title: "Cómo funciona — Pulso",
  description:
    "Cómo operar en los mercados de predicción de Pulso: contratos YES/NO, precios como probabilidad, órdenes a mercado y a límite, resolución y preguntas frecuentes.",
};

export default function ComoFuncionaPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 lg:py-16">
      <p className="text-[11px] font-medium uppercase tracking-wider text-accent-500">Guía</p>
      <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mt-1">Cómo funciona Pulso</h1>
      <p className="text-ink-500 dark:text-ink-400 mt-3 leading-relaxed">
        Pulso es una plataforma de <strong>mercados de predicción</strong>. Operás
        posiciones YES/NO sobre preguntas del futuro usando <strong>créditos virtuales</strong> — sin
        dinero real, sin depósitos ni retiros. Es una herramienta de pronóstico y análisis de
        decisiones, no apuestas ni una casa de bolsa.
      </p>

      {/* ---- Pasos ---- */}
      <Section title="En 4 pasos">
        <ol className="space-y-4">
          <Step n={1} title="Creás tu cuenta">
            Te registrás con email y un usuario, y recibís <strong>$10.000 en créditos
            virtuales</strong> para empezar. Verificá tu email para poder operar.
          </Step>
          <Step n={2} title="Elegís un mercado y un lado">
            Cada mercado es una pregunta de sí/no (ej. <em>“¿Argentina llega a semis del Mundial?”</em>).
            Comprás contratos <span className="text-yes-500 font-semibold">YES</span> si creés que va a
            pasar, o <span className="text-no-500 font-semibold">NO</span> si creés que no.
          </Step>
          <Step n={3} title="Operás">
            Una orden <strong>a mercado</strong> se ejecuta al instante al precio actual; una orden{" "}
            <strong>a límite</strong> espera en el libro hasta que alguien la cruce. El panel te muestra
            el costo, los contratos y el retorno potencial antes de confirmar.
          </Step>
          <Step n={4} title="El mercado se resuelve">
            Cuando se conoce el resultado, cada contrato del lado ganador paga{" "}
            <strong>$1</strong> y el perdedor vale $0. La liquidación a tu saldo es automática.
          </Step>
        </ol>
      </Section>

      {/* ---- Conceptos ---- */}
      <Section title="Conceptos clave">
        <dl className="space-y-4">
          <Concept term="Precio = probabilidad">
            El precio de un contrato va de 1¢ a 99¢ y se lee como la probabilidad implícita del evento.
            Un YES a 32¢ significa que el mercado le asigna ~32% de chance. YES + NO siempre suman $1.00.
          </Concept>
          <Concept term="Pago de $1 por contrato">
            Si el mercado resuelve a tu favor, cada contrato vale $1. Comprar YES a 32¢ y acertar te
            deja una ganancia de 68¢ por contrato; si fallás, perdés los 32¢.
          </Concept>
          <Concept term="Slippage">
            En órdenes a mercado grandes el precio promedio de ejecución se mueve un poco en tu contra
            (hasta 5¢), igual que en un mercado real con liquidez limitada. El costo que ves en el panel
            ya incluye este efecto.
          </Concept>
          <Concept term="Cerrar una posición">
            No tenés que esperar a que el mercado resuelva: podés vender tus contratos a precio de
            mercado cuando quieras desde tu{" "}
            <Link href="/portfolio">portafolio</Link>, realizando tu ganancia o pérdida.
          </Concept>
        </dl>
      </Section>

      {/* ---- FAQ ---- */}
      <section className="mt-12">
        <h2 className="text-xl font-semibold tracking-tight mb-4">Preguntas frecuentes</h2>
        <FaqAccordion items={FAQ} />
      </section>

      {/* ---- CTA ---- */}
      <div className="mt-12 rounded-xl border border-ink-100 dark:border-ink-800 bg-ink-50/60 dark:bg-ink-900/40 p-6 text-center">
        <h3 className="font-semibold text-lg">¿Listo para empezar?</h3>
        <p className="text-sm text-ink-500 dark:text-ink-400 mt-1 mb-4">
          Creá tu cuenta gratis y recibí $10.000 en créditos virtuales.
        </p>
        <div className="flex items-center justify-center gap-2">
          <Link href="/register" className="h-10 px-4 grid place-items-center rounded-lg bg-ink-900 text-white dark:bg-white dark:text-ink-900 text-sm font-medium hover:opacity-90">
            Crear cuenta
          </Link>
          <Link href="/" className="h-10 px-4 grid place-items-center rounded-lg border border-ink-200 dark:border-ink-700 text-sm font-medium hover:bg-ink-50 dark:hover:bg-ink-900">
            Ver mercados
          </Link>
        </div>
      </div>

      <p className="text-xs text-ink-500 dark:text-ink-400 mt-10 italic border-t border-ink-100 dark:border-ink-800 pt-4">
        Se opera con créditos virtuales, sin dinero real. Cada contrato paga $1 si el mercado resuelve a tu
        favor, $0 en caso contrario. No es un valor, no es una apuesta y no hay dinero real involucrado.
        Más detalles en{" "}
        <Link href="/compliance" className="text-accent-500 underline">Cumplimiento</Link>.
      </p>
    </div>
  );
}

const FAQ: FaqItem[] = [
  {
    q: "¿Se juega con dinero real?",
    a: (
      <p>
        No. Pulso usa <strong>créditos virtuales</strong>. No hay depósitos, retiros ni pagos en
        dinero real — es una herramienta de investigación y educación. Ver{" "}
        <Link href="/compliance">Cumplimiento</Link> para el detalle regulatorio.
      </p>
    ),
  },
  {
    q: "¿Cuántos créditos recibo al empezar?",
    a: <p>Cada cuenta nueva recibe <strong>$10.000 en créditos virtuales</strong> al registrarse.</p>,
  },
  {
    q: "¿Qué significan YES y NO?",
    a: (
      <p>
        Cada mercado es una pregunta de sí/no. Un contrato{" "}
        <span className="text-yes-500 font-semibold">YES</span> paga $1 si el evento ocurre; un{" "}
        <span className="text-no-500 font-semibold">NO</span> paga $1 si no ocurre. Comprás el lado en
        el que creés que el mercado se equivoca.
      </p>
    ),
  },
  {
    q: "¿Cómo se determinan los precios?",
    a: (
      <p>
        El precio (de 1¢ a 99¢) refleja la <strong>probabilidad implícita</strong> que el mercado le
        asigna al evento y se mueve con la oferta y la demanda de cada operación. YES y NO siempre suman
        $1.00.
      </p>
    ),
  },
  {
    q: "¿Cuál es la diferencia entre una orden a mercado y a límite?",
    a: (
      <ul>
        <li><strong>A mercado:</strong> se ejecuta de inmediato al mejor precio disponible (con un poco de slippage en tamaños grandes).</li>
        <li><strong>A límite:</strong> elegís el precio y la orden descansa en el libro hasta que otra orden del lado opuesto la cruce (cuando los precios suman ≥ $1.00).</li>
      </ul>
    ),
  },
  {
    q: "Tengo saldo pero me dice “saldo insuficiente”. ¿Por qué?",
    a: (
      <p>
        El costo real de una orden a mercado incluye el <strong>slippage</strong>, así que puede ser un
        poco mayor que el precio actual × contratos. El panel ya te muestra el costo final con slippage
        incluido — usá el botón <strong>Máx</strong> para comprar el máximo que tu saldo permite sin
        pasarte.
      </p>
    ),
  },
  {
    q: "¿Puedo vender antes de que el mercado resuelva?",
    a: (
      <p>
        Sí. Desde tu <Link href="/portfolio">portafolio</Link> podés cerrar cualquier posición a precio
        de mercado cuando quieras, realizando tu ganancia o pérdida sin esperar la resolución.
      </p>
    ),
  },
  {
    q: "¿Cómo se resuelven los mercados?",
    a: (
      <ul>
        <li><strong>Automática por API:</strong> algunos mercados leen una fuente de datos pública (ej. precio de BTC, dólar blue) y se resuelven solos.</li>
        <li><strong>Asistida por IA:</strong> un modelo lee las reglas y fuentes primarias y <em>propone</em> un resultado, pero un admin siempre lo confirma.</li>
        <li><strong>Manual:</strong> el resto pasa por revisión de un administrador según las reglas de resolución del mercado.</li>
        <li>Toda resolución propuesta se puede <strong>disputar</strong> antes de finalizarse.</li>
      </ul>
    ),
  },
  {
    q: "¿Qué pasa si un mercado se anula (VOID)?",
    a: (
      <p>
        Si el evento queda indecidible o ambiguo, el mercado se declara <strong>nulo</strong>: cada
        posición abierta se reembolsa a su costo promedio, dejando tu P&amp;L en cero.
      </p>
    ),
  },
  {
    q: "¿Necesito verificar mi email para operar?",
    a: (
      <p>
        Sí. Podés navegar sin verificar, pero para colocar órdenes tenés que confirmar tu email desde el
        link que te enviamos al registrarte.
      </p>
    ),
  },
  {
    q: "¿Puedo proponer mis propios mercados?",
    a: (
      <p>
        Sí, los usuarios pueden proponer mercados desde <Link href="/markets/new">Proponer</Link>. Un
        administrador los revisa antes de publicarlos.
      </p>
    ),
  },
  {
    q: "¿Esto es legal? ¿Es una apuesta?",
    a: (
      <p>
        No es una apuesta ni un servicio financiero: no se mueve dinero real. La página de{" "}
        <Link href="/compliance">Cumplimiento</Link> explica en detalle cómo se ubica Pulso frente a la
        regulación.
      </p>
    ),
  },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-4 text-sm leading-relaxed text-ink-700 dark:text-ink-300">{children}</div>
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="shrink-0 w-8 h-8 grid place-items-center rounded-full bg-accent-500/10 text-accent-500 font-semibold text-sm num">
        {n}
      </span>
      <div>
        <div className="font-medium text-[15px]">{title}</div>
        <p className="text-ink-600 dark:text-ink-300 mt-0.5">{children}</p>
      </div>
    </li>
  );
}

function Concept({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-ink-100 dark:border-ink-800 p-4">
      <dt className="font-medium text-[15px] mb-1">{term}</dt>
      <dd className="text-ink-600 dark:text-ink-300 [&_a]:text-accent-500 [&_a]:underline">{children}</dd>
    </div>
  );
}
