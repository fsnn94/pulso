"use client";

import { useState } from "react";
import { Icon } from "./Icon";

export type FaqItem = { q: string; a: React.ReactNode };

export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="divide-y divide-ink-100 dark:divide-ink-800 border-y border-ink-100 dark:border-ink-800">
      {items.map((it, i) => {
        const isOpen = open === i;
        return (
          <div key={i}>
            <button
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="w-full flex items-center gap-3 text-left py-4 group"
            >
              <span className="flex-1 font-medium text-[15px] group-hover:text-accent-500 transition-colors">
                {it.q}
              </span>
              <Icon
                name="chevron-down"
                className={`w-4 h-4 shrink-0 text-ink-400 dark:text-ink-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
              />
            </button>
            {isOpen && (
              <div className="pb-5 -mt-1 text-sm leading-relaxed text-ink-600 dark:text-ink-300 space-y-3 [&_a]:text-accent-500 [&_a]:underline [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5">
                {it.a}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
