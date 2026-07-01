import type { Metadata } from "next";

const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export async function generateMetadata(
  { params }: { params: { id: string } },
): Promise<Metadata> {
  try {
    const res = await fetch(`${API}/markets/${params.id}`, { next: { revalidate: 60 } });
    if (!res.ok) throw new Error();
    const m = await res.json();
    const yes = Math.round((m.current_yes_price ?? 0.5) * 100);
    const yesLabel = m.yes_label || "Sí";
    const noLabel = m.no_label || "No";
    const desc = `${yesLabel} ${yes}% · ${noLabel} ${100 - yes}% — mercado de predicción en Pulso (créditos virtuales).`;
    const title = `${m.short_title || m.title} — Pulso`;
    return {
      title,
      description: desc,
      openGraph: { title: m.title, description: desc, type: "website" },
      twitter: { card: "summary_large_image", title: m.title, description: desc },
    };
  } catch {
    return { title: "Mercado — Pulso" };
  }
}

export default function MarketLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
