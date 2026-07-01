import Link from "next/link";
import { DocArticle, DocSection, DocNote } from "@/components/DocPage";

export const metadata = { title: "Restricciones regionales — Pulso" };

export default function RestriccionesPage() {
  return (
    <DocArticle
      eyebrow="Cumplimiento"
      title="Restricciones regionales"
      intro="Dónde y cómo podés usar Pulso. La responsabilidad de verificar que su uso esté permitido en tu jurisdicción es tuya."
    >
      <DocSection title="Principio general">
        <p>
          Pulso es una vista previa de investigación que opera con créditos virtuales, sin dinero
          real. Aun así, <strong>no está disponible donde su uso esté prohibido</strong> por la
          normativa local. Al registrarte, declarás que su uso es lícito en tu jurisdicción.
        </p>
      </DocSection>

      <DocSection title="Tu responsabilidad">
        <ul>
          <li>Confirmar que las plataformas de mercados de predicción estén permitidas donde residís antes de registrarte.</li>
          <li>No usar la plataforma desde territorios donde esté vedada, ni intentar eludir restricciones geográficas.</li>
          <li>Cumplir con las obligaciones tributarias y regulatorias que apliquen en tu país.</li>
        </ul>
      </DocSection>

      <DocSection title="Si Pulso pasara a dinero real">
        <p>
          La disponibilidad por región dependería del régimen que corresponda en cada país. En
          Paraguay, el encuadre probable (CONAJZAR, CNV, SEPRELAD, BCP, SET) y el contexto
          internacional se detallan en el <Link href="/compliance">marco de cumplimiento</Link>.
        </p>
      </DocSection>

      <DocNote>
        Resumen orientativo. No constituye asesoramiento legal. Ante la duda, consultá a un
        profesional habilitado en tu jurisdicción.
      </DocNote>
    </DocArticle>
  );
}
