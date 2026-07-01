import Link from "next/link";
import { Icon } from "./Icon";

type FooterLink = { label: string; href?: string };

export function Footer() {
  return (
    <footer className="border-t border-ink-100 dark:border-ink-800 mt-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-8 text-sm">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-accent-500"><Icon name="logo" className="w-5 h-5"/></span>
            <span className="font-semibold tracking-tight">Pulso</span>
          </div>
          <p className="text-ink-500 dark:text-ink-400 leading-relaxed">
            Una plataforma de predicción de grado académico. Pulso es una herramienta para estudiar probabilidades — no es una casa de bolsa ni un sitio de apuestas.
          </p>
        </div>
        <Col title="Producto" items={[
          { label: "Mercados", href: "/" },
          { label: "Cómo funciona", href: "/como-funciona" },
          { label: "API", href: "/api" },
          { label: "Estado", href: "/estado" },
        ]} />
        <Col title="Recursos" items={[
          { label: "Metodología", href: "/metodologia" },
          { label: "Reglas de resolución", href: "/reglas-de-resolucion" },
          { label: "Glosario", href: "/glosario" },
          { label: "Educación", href: "/como-funciona" },
        ]} />
        <Col title="Cumplimiento" items={[
          { label: "Descargo", href: "/descargo" },
          { label: "Términos", href: "/terminos" },
          { label: "Privacidad", href: "/privacidad" },
          { label: "Restricciones regionales", href: "/restricciones" },
          { label: "Marco regulatorio", href: "/compliance" },
        ]} />
      </div>
      <div className="border-t border-ink-100 dark:border-ink-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row gap-3 sm:items-center text-xs text-ink-500 dark:text-ink-400">
          <span className="flex items-center gap-2"><Icon name="shield" className="w-3.5 h-3.5"/> Operaciones simuladas · Sin dinero real · No disponible donde esté prohibido</span>
          <span className="sm:ml-auto">© 2026 Pulso Research Inc. · Para uso académico y educativo.</span>
        </div>
      </div>
    </footer>
  );
}

function Col({ title, items }: { title: string; items: FooterLink[] }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-3">{title}</div>
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.label}>
            {i.href
              ? <Link href={i.href} className="hover:text-accent-500">{i.label}</Link>
              : <a className="hover:text-accent-500 cursor-pointer">{i.label}</a>}
          </li>
        ))}
      </ul>
    </div>
  );
}
