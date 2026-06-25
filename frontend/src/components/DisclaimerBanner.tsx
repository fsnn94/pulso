"use client";
import { useState } from "react";
import { Icon } from "./Icon";

export function DisclaimerBanner() {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <div className="bg-accent-500/10 border-b border-accent-500/15 text-ink-700 dark:text-ink-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-start sm:items-center gap-3 text-[13px]">
        <span className="text-accent-500 flex-shrink-0 mt-0.5 sm:mt-0"><Icon name="info" className="w-4 h-4"/></span>
        <p className="leading-snug">
          <span className="font-medium">Research preview.</span> Pulso is a forecasting and decision-research tool.
          All trades are simulated using virtual credits — no real money, no payouts, no securities. Not available where prohibited.
        </p>
        <button onClick={() => setOpen(false)} className="ml-auto p-1 -mr-1 text-ink-500 hover:text-ink-900 dark:hover:text-ink-100" aria-label="Dismiss">
          <Icon name="close" className="w-4 h-4"/>
        </button>
      </div>
    </div>
  );
}
