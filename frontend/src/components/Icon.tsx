"use client";
import * as React from "react";

type IconName =
  | "search" | "sun" | "moon" | "star" | "star-fill" | "arrow-up" | "arrow-down"
  | "home" | "wallet" | "menu" | "close" | "info" | "chevron-right" | "chevron-down"
  | "shield" | "logo" | "logout" | "plus" | "user";

export function Icon({
  name, className = "w-4 h-4", strokeWidth = 1.8,
}: { name: IconName; className?: string; strokeWidth?: number }) {
  const common = {
    fill: "none", stroke: "currentColor", strokeWidth,
    strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
    viewBox: "0 0 24 24", className,
  };
  switch (name) {
    case "search":   return (<svg {...common}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>);
    case "sun":      return (<svg {...common}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>);
    case "moon":     return (<svg {...common}><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/></svg>);
    case "star":     return (<svg {...common}><path d="m12 2 3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z"/></svg>);
    case "star-fill":return (<svg viewBox="0 0 24 24" className={className} fill="currentColor"><path d="m12 2 3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z"/></svg>);
    case "arrow-up": return (<svg {...common}><path d="M12 19V5M5 12l7-7 7 7"/></svg>);
    case "arrow-down": return (<svg {...common}><path d="M12 5v14M5 12l7 7 7-7"/></svg>);
    case "home":     return (<svg {...common}><path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg>);
    case "wallet":   return (<svg {...common}><path d="M3 7a2 2 0 0 1 2-2h14v4M3 7v10a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-3h-5a2 2 0 1 1 0-4h5V8a1 1 0 0 0-1-1H3z"/></svg>);
    case "menu":     return (<svg {...common}><path d="M3 6h18M3 12h18M3 18h18"/></svg>);
    case "close":    return (<svg {...common}><path d="M6 6l12 12M18 6 6 18"/></svg>);
    case "info":     return (<svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 8v.01M11 12h1v4h1"/></svg>);
    case "chevron-right": return (<svg {...common}><path d="m9 6 6 6-6 6"/></svg>);
    case "chevron-down":  return (<svg {...common}><path d="m6 9 6 6 6-6"/></svg>);
    case "shield":   return (<svg {...common}><path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6z"/></svg>);
    case "logout":   return (<svg {...common}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>);
    case "plus":     return (<svg {...common}><path d="M12 5v14M5 12h14"/></svg>);
    case "user":     return (<svg {...common}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>);
    case "logo":     return (
      <svg viewBox="0 0 24 24" className={className} fill="none">
        <rect x="2.5" y="2.5" width="19" height="19" rx="5" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M6 16.5 10 11l3 3 5-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
    default: return null;
  }
}
