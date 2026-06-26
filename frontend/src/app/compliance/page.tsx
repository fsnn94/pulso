import Link from "next/link";

export const metadata = { title: "Cumplimiento — Pulso (Paraguay)" };

export default function CompliancePage() {
  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-10 lg:py-16 prose-sm sm:prose dark:prose-invert">
      <p className="text-[11px] font-medium uppercase tracking-wider text-accent-500">Marco regulatorio</p>
      <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mt-1">
        Pulso y la regulación paraguaya
      </h1>
      <p className="text-ink-500 dark:text-ink-400 mt-3 leading-relaxed">
        Pulso opera como una <strong>herramienta de investigación y educación</strong>. Todas las
        operaciones usan créditos virtuales — no hay depósitos, retiros ni pagos en dinero real.
        Esta página documenta cómo interactúa esa clasificación con los principales organismos
        paraguayos que regularían un equivalente con dinero real, y cómo reportaríamos a cada
        uno si Pulso pasara a un régimen regulado.
      </p>

      <Section title="Estado actual">
        <p>
          Como no se mueven fondos reales y la plataforma no paga ganancias monetarias,
          Pulso <strong>no</strong> se encuentra hoy dentro del perímetro de:
        </p>
        <ul>
          <li><strong>CONAJZAR</strong> (Comisión Nacional de Juegos de Azar — regulador del juego). Aplica a juegos de azar por contraprestación de valor.</li>
          <li><strong>CNV</strong> (Comisión Nacional de Valores — regulador de valores). Aplica a la oferta pública de valores y a mercados regulados.</li>
          <li><strong>BCP</strong> (Banco Central del Paraguay — pagos / cambios). Aplica a pagos regulados o emisión de dinero electrónico.</li>
        </ul>
        <p>
          Aun así aplicamos <strong>higiene de cumplimiento defensiva</strong> apropiada para un
          servicio que algún día podría pasar a un régimen regulado: campos de KYC, registro de
          actividad con calidad de auditoría y exportes de transacciones reportables.
        </p>
      </Section>

      <Section title="Si pasáramos a dinero real — qué cambia">
        <ul>
          <li>
            <strong>CONAJZAR</strong> es el supervisor más probable para mercados de resultado binario
            liquidados en dinero (marco de la Ley 1.016/97). Se requerirían autorización, capital,
            controles técnicos y reportes antilavado.
          </li>
          <li>
            <strong>CNV</strong> es relevante si los productos se caracterizan como valores, swaps o
            contratos derivados (la Ley 5.810/2017 modernizó el régimen del mercado de valores).
          </li>
          <li>
            <strong>SEPRELAD</strong> (Secretaría de Prevención de Lavado de Dinero o Bienes) impone
            obligaciones de reporte a las entidades reguladas — KYC, beneficiario final, reportes
            de operaciones sospechosas (ROS) — bajo la Ley 1.015/97 y normas sucesivas.
          </li>
          <li>
            <strong>SET</strong> (Subsecretaría de Estado de Tributación) — las ganancias estarían
            sujetas a IRACIS/IRP/IVA según el estatus de la entidad.
          </li>
        </ul>
      </Section>

      <Section title="Protección de datos (Ley 6534/2020)">
        <p>
          Tratamos los usuarios, emails, campos de KYC, direcciones IP e historial de
          transacciones como datos personales sujetos a la Ley 6534/2020 de Paraguay (y a
          cualquier ley sucesora de protección de datos). Bases legales:
        </p>
        <ul>
          <li><em>Ejecución contractual</em> — para operar la cuenta del usuario.</li>
          <li><em>Interés legítimo</em> — para prevención de fraude e integridad de la plataforma.</li>
          <li><em>Obligación legal</em> — para conservar registros y responder a pedidos de reguladores.</li>
        </ul>
        <p>
          Los usuarios pueden solicitar acceso, corrección o eliminación de datos personales
          mediante el formulario de cumplimiento dentro de la app (sujeto a obligaciones legales
          de retención).
        </p>
      </Section>

      <Section title="Exportes listos para el regulador">
        <p>
          Los admins pueden generar un CSV de auditoría listo para el regulador, para cualquier
          rango de fechas, desde la{" "}
          <Link href="/admin/cashflow" className="text-accent-500 underline">página de Flujo de caja</Link>.
          El export incluye una fila por operación con: ID de operación, marca de tiempo UTC,
          ID de mercado + categoría, lado, precio, cantidad, nocional y el usuario, email, país,
          nombre completo (si se cargó en KYC), número de documento y bandera de revisión AML.
        </p>
        <p>
          El formato está pensado para ser ingerible por flujos de reporte tipo SEPRELAD y por
          los registros que pide la CNV sin transformaciones adicionales.
        </p>
      </Section>

      <Section title="Responsabilidades del usuario">
        <ul>
          <li>Proporcionar información KYC veraz cuando se solicite. Ver <Link href="/settings/compliance" className="text-accent-500 underline">tu perfil de cumplimiento</Link>.</li>
          <li>No usar la plataforma con fines prohibidos: fraccionar operaciones para evadir reportes, manipulación de mercado o uso de identidad ajena.</li>
          <li>Confirmar que la plataforma esté permitida en tu jurisdicción antes de registrarte.</li>
        </ul>
      </Section>

      <p className="text-xs text-ink-500 dark:text-ink-400 mt-12 italic">
        Esta página es un resumen en lenguaje claro con fines de orientación general. No
        constituye asesoramiento legal. Operar cualquier servicio de mercados de predicción en
        Paraguay debería ser revisado por asesoría legal paraguaya habilitada antes del lanzamiento.
      </p>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="text-sm leading-relaxed text-ink-700 dark:text-ink-300 mt-3 space-y-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_strong]:font-semibold">
        {children}
      </div>
    </section>
  );
}
