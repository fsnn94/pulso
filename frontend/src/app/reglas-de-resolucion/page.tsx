import Link from "next/link";
import { DocArticle, DocSection, DocNote } from "@/components/DocPage";

export const metadata = { title: "Reglas de resolución — Pulso" };

export default function ReglasResolucionPage() {
  return (
    <DocArticle
      eyebrow="Recursos"
      title="Reglas de resolución"
      intro="Cómo un mercado pasa de estar abierto a quedar liquidado, quién decide el resultado y qué mecanismos existen para impugnarlo."
    >
      <DocSection title="Ciclo de vida de un mercado">
        <ul>
          <li><strong>Abierto (OPEN).</strong> Se opera libremente hasta la fecha de cierre.</li>
          <li><strong>Cerrado (CLOSED).</strong> Pasó la fecha de cierre; se frena la operatoria y el mercado espera resolución.</li>
          <li><strong>En revisión (PROPOSED).</strong> El resolutor propuso un resultado tentativo y corre la ventana de desafío.</li>
          <li><strong>Disputado (DISPUTED).</strong> Al menos un usuario impugnó la propuesta con fundamento; queda para revisión de un administrador.</li>
          <li><strong>Resuelto (RESOLVED).</strong> Resultado final SÍ/NO; se pagó a las posiciones ganadoras.</li>
          <li><strong>Nulo (VOIDED).</strong> Evento cancelado o ambiguo; se reembolsa a cada posición su costo promedio.</li>
        </ul>
      </DocSection>

      <DocSection title="Quién resuelve">
        <p>Cada mercado declara cómo se resuelve:</p>
        <ul>
          <li><strong>Resolutor manual.</strong> El resultado lo carga un administrador a partir de la fuente oficial primaria declarada en el mercado.</li>
          <li><strong>Resolutor automático (fuente de datos).</strong> Un endpoint de datos definido en la configuración del mercado se consulta y se compara contra un umbral (por ejemplo, "≥ 150.000"). Si se cumple la condición, se propone el resultado.</li>
        </ul>
      </DocSection>

      <DocSection title="Ventana de desafío y disputas">
        <p>
          Cuando el resolutor propone un resultado, no se finaliza al instante: se abre una
          <strong> ventana de desafío</strong> (por defecto 24 horas). Durante ese lapso cualquier
          participante puede <strong>presentar una disputa</strong> con un motivo y, opcionalmente,
          un enlace de evidencia.
        </p>
        <ul>
          <li>Si nadie disputa dentro de la ventana, la propuesta se <strong>auto-confirma</strong> y el mercado se liquida.</li>
          <li>Si hay una disputa válida, el mercado pasa a <strong>Disputado</strong> y un administrador confirma o corrige el resultado antes de finalizar.</li>
        </ul>
      </DocSection>

      <DocSection title="Liquidación y pagos">
        <ul>
          <li>Al resolverse <strong>SÍ</strong> o <strong>NO</strong>, cada contrato del lado ganador se paga a 100¢ y el perdedor vale 0¢.</li>
          <li>Sobre las ganancias realizadas se aplica la <Link href="/metodologia">comisión de la casa</Link>.</li>
          <li>Al anularse (<strong>Nulo</strong>), cada posición se reembolsa a su costo promedio: nadie gana ni pierde.</li>
        </ul>
      </DocSection>

      <DocNote>
        El encuadre regulatorio de la resolución y la retención de registros se detalla en el{" "}
        <Link href="/compliance">marco de cumplimiento</Link>.
      </DocNote>
    </DocArticle>
  );
}
