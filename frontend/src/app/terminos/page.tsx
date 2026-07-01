import Link from "next/link";
import { DocArticle, DocSection, DocNote } from "@/components/DocPage";

export const metadata = { title: "Términos de uso — Pulso" };

export default function TerminosPage() {
  return (
    <DocArticle
      eyebrow="Cumplimiento"
      title="Términos de uso"
      intro="Las condiciones para usar Pulso. Al crear una cuenta, aceptás estos términos."
    >
      <DocSection title="1. Elegibilidad y cuenta">
        <ul>
          <li>Debés ser mayor de edad en tu jurisdicción y usar la plataforma solo donde esté permitida.</li>
          <li>Sos responsable de la seguridad de tu cuenta y de la actividad realizada con ella.</li>
          <li>Una persona, una cuenta. No se permite operar con identidad ajena.</li>
        </ul>
      </DocSection>

      <DocSection title="2. Naturaleza del servicio">
        <p>
          Pulso opera con créditos virtuales y sin dinero real. No es un servicio financiero ni de
          apuestas. Ver el <Link href="/descargo">descargo de responsabilidad</Link>.
        </p>
      </DocSection>

      <DocSection title="3. Conducta prohibida">
        <ul>
          <li>Manipular mercados, coordinar operatoria o realizar <em>wash trading</em>.</li>
          <li>Fraccionar operaciones para evadir controles, o intentar eludir el monitoreo AML.</li>
          <li>Acceder sin autorización a cuentas, datos o sistemas de la plataforma.</li>
          <li>Usar la plataforma para actividades ilícitas o para financiarlas.</li>
        </ul>
        <p>El incumplimiento puede derivar en la suspensión o eliminación de la cuenta.</p>
      </DocSection>

      <DocSection title="4. Contenido y propuestas">
        <p>
          Al proponer un mercado aceptás que sea revisado y, si se aprueba, publicado. Nos reservamos
          el derecho de editar, rechazar o dar de baja mercados que no cumplan las reglas.
        </p>
      </DocSection>

      <DocSection title="5. Disponibilidad y cambios">
        <p>
          El servicio se ofrece "tal cual", sin garantías de disponibilidad. Podemos modificar
          funciones, reglas o estos términos; los cambios relevantes se comunicarán en la plataforma.
        </p>
      </DocSection>

      <DocSection title="6. Datos y privacidad">
        <p>
          El tratamiento de datos personales se rige por la{" "}
          <Link href="/privacidad">política de privacidad</Link>, alineada con la Ley 6.534/2020 de
          Paraguay.
        </p>
      </DocSection>

      <DocSection title="7. Ley aplicable">
        <p>
          Estos términos se interpretan bajo las leyes de la República del Paraguay. El encuadre
          regulatorio se detalla en el <Link href="/compliance">marco de cumplimiento</Link>.
        </p>
      </DocSection>

      <DocNote>
        Resumen en lenguaje claro con fines de orientación general. No constituye asesoramiento legal.
      </DocNote>
    </DocArticle>
  );
}
