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
        paraguayos que regularían un equivalente con dinero real, y qué controles ya aplicamos por
        diseño para facilitar una eventual transición a un régimen regulado.
      </p>

      <Section title="Estado actual: fuera del perímetro de los reguladores financieros">
        <p>
          Como no se mueven fondos reales y la plataforma no paga ganancias monetarias,
          Pulso <strong>no</strong> se encuentra hoy dentro del perímetro de:
        </p>
        <ul>
          <li>
            <strong>CONAJZAR</strong> (Comisión Nacional de Juegos de Azar) — regulador del juego
            bajo la <em>Ley 1.016/97</em>. Aplica a juegos de azar por contraprestación de valor.
          </li>
          <li>
            <strong>CNV</strong> (Comisión Nacional de Valores) — regulador del mercado de valores
            bajo la <em>Ley 5.810/2017</em>. Aplica a la oferta pública de valores y a mercados
            regulados.
          </li>
          <li>
            <strong>BCP</strong> (Banco Central del Paraguay) — supervisor de entidades financieras
            y sistema de pagos. Aplica a entidades de crédito reguladas, emisores de dinero
            electrónico y procesadores de pagos.
          </li>
          <li>
            <strong>SEPRELAD</strong> (Secretaría de Prevención de Lavado de Dinero o Bienes) —
            unidad de inteligencia financiera bajo la <em>Ley 1.015/97</em>, modificada por la{" "}
            <em>Ley 6.452/2019</em> y reglamentada por el <em>Decreto 4.561/2010</em>. Aplica a
            sujetos obligados reportantes.
          </li>
        </ul>
        <p>
          Aun así aplicamos <strong>higiene de cumplimiento defensiva</strong>: campos de KYC,
          registro de actividad con calidad de auditoría, monitoreo AML y exportes ingeribles por
          flujos de reporte regulatorio.
        </p>
      </Section>

      <Section title="Tabla comparativa: hoy vs. modelo real-money">
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full text-xs sm:text-sm border border-ink-200 dark:border-ink-800">
            <thead className="bg-ink-50 dark:bg-ink-900">
              <tr>
                <th className="text-left p-2 sm:p-3 font-semibold border-b border-ink-200 dark:border-ink-800">Dimensión</th>
                <th className="text-left p-2 sm:p-3 font-semibold border-b border-ink-200 dark:border-ink-800">Pulso hoy</th>
                <th className="text-left p-2 sm:p-3 font-semibold border-b border-ink-200 dark:border-ink-800">Si pasara a dinero real</th>
              </tr>
            </thead>
            <tbody className="[&>tr>td]:p-2 [&>tr>td]:sm:p-3 [&>tr]:border-t [&>tr]:border-ink-200 [&>tr]:dark:border-ink-800 [&>tr>td]:align-top">
              <tr>
                <td className="font-medium">Unidad de cuenta</td>
                <td>Créditos virtuales (USD ficticios)</td>
                <td>PYG, USD u otra moneda fiat o stablecoin regulada</td>
              </tr>
              <tr>
                <td className="font-medium">Supervisor probable</td>
                <td>Ninguno (research preview)</td>
                <td>CONAJZAR (binarios) o CNV (si se caracteriza como derivado)</td>
              </tr>
              <tr>
                <td className="font-medium">Régimen AML</td>
                <td>Controles internos por buenas prácticas</td>
                <td>Sujeto obligado SEPRELAD: ROS, KYC reforzado, PEP, beneficiario final</td>
              </tr>
              <tr>
                <td className="font-medium">Tributación</td>
                <td>No aplica (sin renta)</td>
                <td>IRACIS / IRP / IVA según figura jurídica (SET)</td>
              </tr>
              <tr>
                <td className="font-medium">Capital mínimo</td>
                <td>N/A</td>
                <td>Definido por la autorización elegida</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Controles internos implementados">
        <p>
          Estos controles los aplicamos ya en modo investigación para que la transición a un
          régimen regulado, si ocurriera, requiera ajustes mínimos:
        </p>
        <ul>
          <li>
            <strong>KYC básico</strong> — al verificar el email, el usuario puede completar:
            nombre completo, país de residencia, número de documento (CI o equivalente) y fecha
            de nacimiento. Ver{" "}
            <Link href="/settings/compliance" className="text-accent-500 underline">tu perfil de cumplimiento</Link>.
          </li>
          <li>
            <strong>Registro de actividad inmutable</strong> — cada operación, orden y resolución
            queda con marca de tiempo UTC, usuario, mercado y monto. Sin edición posterior.
          </li>
          <li>
            <strong>Monitoreo AML automatizado</strong> — el motor evalúa siete reglas en cada
            operación: velocidad alta, concentración por mercado, wash trading, cuenta nueva con
            alto volumen, ciclos ida-y-vuelta y otras señales (ver más abajo).
          </li>
          <li>
            <strong>Retención de registros</strong> — los registros financieros y AML se conservan
            por <em>al menos 5 años</em>, alineado con la práctica habitual del régimen SEPRELAD.
          </li>
          <li>
            <strong>Exportes ingeribles por el regulador</strong> — CSV de auditoría descargable
            por rango de fechas desde la página de{" "}
            <Link href="/admin/cashflow" className="text-accent-500 underline">Flujo de caja</Link>.
          </li>
          <li>
            <strong>Disclaimer obligatorio</strong> — todo usuario acepta al registrarse que
            Pulso es una plataforma de investigación, no un servicio financiero ni de apuestas.
          </li>
        </ul>
      </Section>

      <Section title="Reglas AML aplicadas">
        <p>El motor de prevención evalúa cada operación contra siete reglas:</p>
        <ul>
          <li><strong>RULE_VELOCITY_HIGH</strong> — alta cantidad de operaciones en una ventana corta</li>
          <li><strong>RULE_NOTIONAL_CONCENTRATION</strong> — concentración significativa en un solo mercado</li>
          <li><strong>RULE_SELF_TRADING</strong> — operaciones cruzadas entre el mismo usuario en YES/NO del mismo mercado (wash trading)</li>
          <li><strong>RULE_NEW_ACCOUNT_HIGH_VOLUME</strong> — cuenta recién creada operando montos altos</li>
          <li><strong>RULE_REPEATED_COUNTERPARTY</strong> — operaciones repetidas con la misma contraparte (potencial coordinación)</li>
          <li><strong>RULE_ROUND_TRIP</strong> — patrón de ida y vuelta dentro de una ventana corta</li>
          <li><strong>RULE_OFFHOURS_HIGH_VOLUME</strong> — actividad fuera de horario habitual desde cuentas nuevas</li>
        </ul>
        <p>
          Las alertas que generan estas reglas se persisten en una cola dedicada y son revisadas
          desde{" "}
          <Link href="/admin/aml" className="text-accent-500 underline">/admin/aml</Link> con
          acciones de acuse, descarte o escalamiento. Existe también la posibilidad de{" "}
          <strong>silenciar reglas por usuario</strong> con auditoría completa, para casos
          legítimos (ej. market makers).
        </p>
      </Section>

      <Section title="Si pasáramos a dinero real — el path regulatorio">
        <ul>
          <li>
            <strong>CONAJZAR</strong> es el supervisor más probable para mercados de resultado
            binario liquidados en dinero, dentro del marco de la <em>Ley 1.016/97</em>. Se
            requerirían: autorización previa, capital mínimo definido, controles técnicos sobre el
            sistema de matching, auditorías y reportes antilavado periódicos.
          </li>
          <li>
            <strong>CNV</strong> entra si los productos se caracterizan como valores negociables,
            swaps o contratos derivados (<em>Ley 5.810/2017</em>). El modelo del market-maker
            automatizado y la estructura YES/NO podrían encuadrarse como contratos sintéticos.
          </li>
          <li>
            <strong>SEPRELAD</strong> impone obligaciones a sujetos obligados bajo la{" "}
            <em>Ley 1.015/97</em>, modificada por la <em>Ley 6.452/2019</em>: identificación del
            cliente (KYC), identificación del beneficiario final, screening de Personas
            Expuestas Políticamente (PEP), monitoreo continuo y reporte de operaciones
            sospechosas (ROS) al SIRO. La reglamentación está en el{" "}
            <em>Decreto 4.561/2010</em>.
          </li>
          <li>
            <strong>BCP</strong> aparece si Pulso integra una pasarela de pagos local
            (Bancard, Pago Express) o si emite saldo electrónico — caería bajo el régimen de
            <em>Entidades de Pago</em> y/o <em>Entidades de Medios de Pago Electrónicos</em>.
          </li>
          <li>
            <strong>SET</strong> (Subsecretaría de Estado de Tributación) — las ganancias estarían
            sujetas a IRACIS, IRP y/o IVA según el estatus de la entidad emisora.
          </li>
        </ul>
        <p className="text-xs text-ink-500 dark:text-ink-400 italic mt-3">
          Las recomendaciones del <strong>GAFI</strong> (Recomendaciones 10, 11 y 20 en
          particular — identificación, registro y reporte) son el estándar internacional al que
          Paraguay adhirió y orientan la interpretación de la SEPRELAD.
        </p>
      </Section>

      <Section title="Protección de datos personales (Ley 6.534/2020)">
        <p>
          Tratamos los emails, campos de KYC, direcciones IP e historial de transacciones como
          datos personales sujetos a la <em>Ley 6.534/2020</em> de Paraguay (y a cualquier ley
          sucesora). Bases legales:
        </p>
        <ul>
          <li><em>Ejecución contractual</em> — para operar la cuenta del usuario.</li>
          <li><em>Interés legítimo</em> — para prevención de fraude e integridad de la plataforma.</li>
          <li><em>Obligación legal</em> — para conservar registros y responder a pedidos de reguladores.</li>
        </ul>
        <p>
          Los usuarios pueden solicitar acceso, corrección o eliminación de datos personales,
          sujeto a obligaciones legales de retención (notablemente la retención AML de 5 años).
        </p>
      </Section>

      <Section title="Responsabilidades del usuario">
        <ul>
          <li>Proporcionar información KYC veraz cuando se solicite. Ver <Link href="/settings/compliance" className="text-accent-500 underline">tu perfil de cumplimiento</Link>.</li>
          <li>No usar la plataforma con fines prohibidos: fraccionar operaciones para evadir reportes, manipulación de mercado, uso de identidad ajena o financiamiento de actividades ilícitas.</li>
          <li>Confirmar que la plataforma esté permitida en tu jurisdicción antes de registrarte.</li>
          <li>Reportar al equipo cualquier sospecha de uso indebido a través del canal de soporte.</li>
        </ul>
      </Section>

      <Section title="Contexto internacional">
        <p>
          A nivel global existen dos modelos principales para regular mercados de predicción
          con dinero real:
        </p>
        <ul>
          <li>
            <strong>EE.UU.</strong> — la <em>CFTC</em> (Commodity Futures Trading Commission)
            regula plataformas como Kalshi bajo el marco de los <em>Designated Contract
            Markets</em>. Polymarket opera en jurisdicciones offshore (Bermudas y, recientemente,
            con cumplimiento condicionado en EE.UU.).
          </li>
          <li>
            <strong>Unión Europea</strong> — <em>MiCA</em> (Markets in Crypto-Assets Regulation,
            aplicación plena 2025) cubre activos cripto pero no resuelve la clasificación de
            mercados de predicción; cada país aplica su régimen de juego o de valores.
          </li>
          <li>
            <strong>Reino Unido</strong> — la <em>FCA</em> y la <em>Gambling Commission</em> se
            disputan la clasificación; en la práctica los principales operadores se autorregulan
            como spread betting.
          </li>
        </ul>
        <p className="text-xs text-ink-500 dark:text-ink-400 italic mt-3">
          Paraguay tendría que tomar una postura propia: hoy no hay un régimen específico para
          mercados de predicción.
        </p>
      </Section>

      <p className="text-xs text-ink-500 dark:text-ink-400 mt-12 italic border-t border-ink-200 dark:border-ink-800 pt-4">
        Esta página es un resumen en lenguaje claro con fines de orientación general. <strong>No
        constituye asesoramiento legal.</strong> Las referencias a leyes, decretos y resoluciones
        son orientativas; los textos vigentes deben consultarse en la Gaceta Oficial y en los
        sitios web de los respectivos organismos. Operar cualquier servicio de mercados de
        predicción con dinero real en Paraguay debería ser revisado por asesoría legal paraguaya
        habilitada antes del lanzamiento.
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
