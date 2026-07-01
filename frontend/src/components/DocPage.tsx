import React from "react";

/** Layout compartido para páginas de contenido (metodología, glosario, términos,
 *  etc.). Mantiene el mismo estilo tipográfico que /compliance. */
export function DocArticle({
  eyebrow, title, intro, children,
}: { eyebrow: string; title: string; intro?: React.ReactNode; children: React.ReactNode }) {
  return (
    <article className="view-enter max-w-3xl mx-auto px-4 sm:px-6 py-10 lg:py-16">
      <p className="text-[11px] font-medium uppercase tracking-wider text-accent-500">{eyebrow}</p>
      <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mt-1">{title}</h1>
      {intro && <p className="text-ink-500 dark:text-ink-400 mt-3 leading-relaxed">{intro}</p>}
      {children}
    </article>
  );
}

export function DocSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="text-sm leading-relaxed text-ink-700 dark:text-ink-300 mt-3 space-y-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1.5 [&_strong]:font-semibold [&_a]:text-accent-500 [&_a]:underline">
        {children}
      </div>
    </section>
  );
}

export function DocNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-ink-500 dark:text-ink-400 mt-12 italic border-t border-ink-200 dark:border-ink-800 pt-4">
      {children}
    </p>
  );
}
