import Link from "next/link";
import { DocArticle, DocSection, DocNote } from "@/components/DocPage";

export const metadata = { title: "Metodología — Pulso" };

export default function MetodologiaPage() {
  return (
    <DocArticle
      eyebrow="Recursos"
      title="Metodología"
      intro="Cómo Pulso convierte la actividad de una comunidad de analistas en un precio que se lee como una probabilidad. Todo ocurre con créditos virtuales: no hay dinero real."
    >
      <DocSection title="El precio es una probabilidad">
        <p>
          Cada mercado es una pregunta de resultado binario (SÍ / NO). El precio de un contrato
          <strong> SÍ</strong> vive entre 1¢ y 99¢ y se interpreta como la probabilidad implícita
          de que el evento ocurra: un SÍ a <strong>63¢</strong> equivale a un consenso de ~63% de
          probabilidad. El contrato <strong>NO</strong> vale siempre <em>1 − precio SÍ</em>. Al
          resolverse, el lado ganador vale 100¢ y el perdedor 0¢.
        </p>
      </DocSection>

      <DocSection title="Cómo se forma el precio">
        <p>Tres fuerzas mueven el precio de un mercado:</p>
        <ul>
          <li>
            <strong>Libro de órdenes.</strong> Las órdenes a límite de compra y venta de cada lado
            forman un libro. El motor de <em>matching</em> cruza órdenes compatibles y cada
            ejecución imprime un precio nuevo.
          </li>
          <li>
            <strong>Órdenes a mercado.</strong> Una orden de mercado consume la mejor liquidez
            disponible del libro; si mueve el precio, paga un pequeño <em>slippage</em>.
          </li>
          <li>
            <strong>Solo flujo real.</strong> El precio se mueve exclusivamente con las órdenes de
            los participantes: no hay ningún proceso que "empuje" el precio artificialmente. Cada
            ejecución imprime un precio nuevo que se transmite en vivo por WebSocket.
          </li>
        </ul>
      </DocSection>

      <DocSection title="Liquidez, spread y slippage">
        <ul>
          <li><strong>Liquidez.</strong> El interés abierto disponible en el libro. Más liquidez = precios más estables ante una orden grande.</li>
          <li><strong>Spread.</strong> La diferencia entre la mejor compra y la mejor venta. Un spread angosto indica un mercado más eficiente.</li>
          <li><strong>Slippage.</strong> El costo de mover el precio cuando tu orden es más grande que la liquidez al mejor nivel. Pulso lo modela explícitamente (hasta unos pocos centavos) tanto en el backend como en el panel de compra, para que el costo que ves sea el costo real.</li>
        </ul>
      </DocSection>

      <DocSection title="Patrimonio, P&L y comisión">
        <ul>
          <li><strong>Patrimonio (equity).</strong> Tu saldo en efectivo más el valor de mercado de tus posiciones abiertas, valuadas al precio actual.</li>
          <li><strong>P&L no realizado.</strong> La diferencia entre el valor actual de tus posiciones y lo que pagaste por ellas.</li>
          <li><strong>P&L realizado.</strong> La ganancia/pérdida ya materializada al cerrar posiciones o al resolverse el mercado, <em>neta de comisión</em>.</li>
          <li><strong>Comisión.</strong> La casa cobra un fee (por defecto 5%) únicamente sobre cada <em>ganancia</em> realizada. Nunca sobre pérdidas ni sobre el nominal operado.</li>
        </ul>
        <p>
          Podés seguir la evolución de tu patrimonio por timeframe en tu{" "}
          <Link href="/portfolio">portafolio</Link>.
        </p>
      </DocSection>

      <DocNote>
        ¿Buscás las definiciones puntuales? Mirá el <Link href="/glosario">glosario</Link>. Para el
        recorrido paso a paso, <Link href="/como-funciona">cómo funciona</Link>. Para cómo se
        liquidan los mercados, las <Link href="/reglas-de-resolucion">reglas de resolución</Link>.
      </DocNote>
    </DocArticle>
  );
}
