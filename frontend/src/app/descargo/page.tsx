import Link from "next/link";
import { DocArticle, DocSection, DocNote } from "@/components/DocPage";

export const metadata = { title: "Descargo de responsabilidad — Pulso" };

export default function DescargoPage() {
  return (
    <DocArticle
      eyebrow="Cumplimiento"
      title="Descargo de responsabilidad"
      intro="Qué es Pulso y, sobre todo, qué no es."
    >
      <DocSection title="Plataforma de investigación y educación">
        <p>
          Pulso es una herramienta para <strong>estudiar probabilidades sobre eventos futuros</strong>.
          Toda la operatoria se realiza con <strong>créditos virtuales</strong>: no hay depósitos,
          retiros, premios ni pagos en dinero real, y no se puede convertir el saldo simulado en
          fondos reales.
        </p>
      </DocSection>

      <DocSection title="No es asesoramiento ni un servicio financiero">
        <ul>
          <li>Pulso <strong>no</strong> es una casa de bolsa, un mercado de valores ni un servicio de inversión.</li>
          <li>Pulso <strong>no</strong> es una casa de apuestas ni un sitio de juegos de azar por dinero.</li>
          <li>Nada en la plataforma constituye asesoramiento financiero, legal, contable ni de inversión.</li>
          <li>Los precios reflejan el consenso simulado de la comunidad y de un motor de mercado; <strong>no predicen el futuro</strong> ni garantizan resultado alguno.</li>
        </ul>
      </DocSection>

      <DocSection title="Sin garantías">
        <p>
          El servicio se ofrece "tal cual", como una vista previa de investigación. No garantizamos
          disponibilidad continua, exactitud de los datos de terceros (incluidas las noticias) ni la
          resolución sin errores de ningún mercado. Podemos modificar, suspender o discontinuar
          funciones en cualquier momento.
        </p>
      </DocSection>

      <DocNote>
        Este descargo se complementa con los <Link href="/terminos">términos de uso</Link>, la{" "}
        <Link href="/privacidad">política de privacidad</Link> y el{" "}
        <Link href="/compliance">marco de cumplimiento</Link>. No constituye asesoramiento legal.
      </DocNote>
    </DocArticle>
  );
}
