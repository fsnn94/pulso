import Link from "next/link";
import { DocArticle, DocSection, DocNote } from "@/components/DocPage";

export const metadata = { title: "Privacidad — Pulso" };

export default function PrivacidadPage() {
  return (
    <DocArticle
      eyebrow="Cumplimiento"
      title="Política de privacidad"
      intro="Qué datos tratamos, con qué base legal y qué derechos tenés. Alineado con la Ley 6.534/2020 de protección de datos personales de Paraguay."
    >
      <DocSection title="Datos que tratamos">
        <ul>
          <li><strong>Cuenta.</strong> Email, nombre de usuario (handle) y contraseña (almacenada con hash, nunca en texto plano).</li>
          <li><strong>KYC opcional.</strong> Nombre completo, país, número de documento y fecha de nacimiento, si elegís completarlo.</li>
          <li><strong>Actividad.</strong> Órdenes, operaciones, posiciones y resoluciones, con marca de tiempo UTC.</li>
          <li><strong>Técnicos.</strong> Datos de conexión necesarios para operar el servicio y prevenir fraude.</li>
        </ul>
      </DocSection>

      <DocSection title="Bases legales">
        <ul>
          <li><em>Ejecución contractual</em> — para operar tu cuenta y brindarte el servicio.</li>
          <li><em>Interés legítimo</em> — para prevención de fraude e integridad de la plataforma.</li>
          <li><em>Obligación legal</em> — para conservar registros y responder pedidos de reguladores.</li>
        </ul>
      </DocSection>

      <DocSection title="Conservación">
        <p>
          Los registros financieros y de prevención (AML) se conservan por{" "}
          <strong>al menos 5 años</strong>, en línea con la práctica del régimen SEPRELAD. El resto
          de los datos se conserva mientras tu cuenta esté activa y por el plazo necesario para las
          finalidades descritas.
        </p>
      </DocSection>

      <DocSection title="Tus derechos">
        <p>
          Podés solicitar <strong>acceso, corrección o eliminación</strong> de tus datos personales,
          sujeto a las obligaciones legales de retención (notablemente la retención AML de 5 años).
          Podés gestionar tus datos de cuenta y KYC desde{" "}
          <Link href="/settings">tu cuenta</Link> y{" "}
          <Link href="/settings/compliance">tu perfil de cumplimiento</Link>.
        </p>
      </DocSection>

      <DocSection title="Terceros">
        <p>
          Algunas secciones muestran contenido de terceros (por ejemplo, titulares de noticias vía
          proveedores externos). Esos contenidos se rigen por las políticas de sus respectivas
          fuentes; Pulso no vende tus datos personales.
        </p>
      </DocSection>

      <DocNote>
        Resumen en lenguaje claro con fines de orientación general. No constituye asesoramiento
        legal. Ver también el <Link href="/compliance">marco de cumplimiento</Link>.
      </DocNote>
    </DocArticle>
  );
}
