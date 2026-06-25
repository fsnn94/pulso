import { Icon } from "./Icon";

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
            A research-grade prediction platform. Pulso is a tool for studying probability, not a brokerage and not a betting site.
          </p>
        </div>
        <Col title="Product" items={["Markets", "How it works", "API", "Status"]} />
        <Col title="Resources" items={["Methodology", "Resolution rules", "Glossary", "Education"]} />
        <Col title="Compliance" items={["Disclaimer", "Terms", "Privacy", "Regional restrictions"]} />
      </div>
      <div className="border-t border-ink-100 dark:border-ink-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row gap-3 sm:items-center text-xs text-ink-500 dark:text-ink-400">
          <span className="flex items-center gap-2"><Icon name="shield" className="w-3.5 h-3.5"/> Simulated trading · No real money · Not available where prohibited</span>
          <span className="sm:ml-auto">© 2026 Pulso Research Inc. · For research and educational use.</span>
        </div>
      </div>
    </footer>
  );
}

function Col({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-3">{title}</div>
      <ul className="space-y-2">
        {items.map((i) => (<li key={i}><a className="hover:text-accent-500 cursor-pointer">{i}</a></li>))}
      </ul>
    </div>
  );
}
