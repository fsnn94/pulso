"use client";

import Link from "next/link";
import { api } from "@/lib/api";
import { DocArticle, DocSection, DocNote } from "@/components/DocPage";

export default function ApiPage() {
  const base = api.base;
  return (
    <DocArticle
      eyebrow="Producto"
      title="API"
      intro="Pulso corre sobre una API HTTP + WebSocket. La exploración pública es de solo lectura; las acciones que cambian estado requieren autenticación."
    >
      <DocSection title="Documentación interactiva">
        <p>
          El backend expone documentación autogenerada (OpenAPI/Swagger) que podés explorar en vivo:
        </p>
        <ul>
          <li><a href={`${base}/docs`} target="_blank" rel="noopener noreferrer">Explorador interactivo (Swagger UI)</a></li>
          <li><a href={`${base}/openapi.json`} target="_blank" rel="noopener noreferrer">Especificación OpenAPI (JSON)</a></li>
          <li><a href={`${base}/health`} target="_blank" rel="noopener noreferrer">Health check</a> — ver también el <Link href="/estado">estado del sistema</Link></li>
        </ul>
      </DocSection>

      <DocSection title="Autenticación">
        <p>
          Las rutas que requieren sesión usan un <strong>token JWT</strong> enviado en el header{" "}
          <code>Authorization: Bearer &lt;token&gt;</code>. El token se obtiene en{" "}
          <code>POST /auth/login</code> y queda atado al hash de tu contraseña: al cambiarla, las
          sesiones anteriores se invalidan.
        </p>
      </DocSection>

      <DocSection title="Tiempo real">
        <p>
          Los cambios de precio y el ciclo de vida de los mercados se transmiten por WebSocket en{" "}
          <code>{base.replace(/^http/, "ws")}/ws</code>, que es lo que mantiene viva la cinta de
          precios en la interfaz.
        </p>
      </DocSection>

      <DocNote>
        La API está pensada para transparencia y exploración; su superficie y
        contratos pueden cambiar. No hay, por ahora, un programa de claves de API para terceros.
      </DocNote>
    </DocArticle>
  );
}
