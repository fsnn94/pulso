import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "Mercado de predicción en Pulso";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

const ACCENT = "#A41F13";
const INK = "#1a1a1a";
const MUTED = "#6b6b6b";
const BG = "#faf9f7";

export default async function Image({ params }: { params: { id: string } }) {
  let title = "Mercado de predicción";
  let yes = 50, yesLabel = "Sí", noLabel = "No", category = "";
  try {
    const res = await fetch(`${API}/markets/${params.id}`, { next: { revalidate: 60 } });
    if (res.ok) {
      const m = await res.json();
      title = m.title || title;
      yes = Math.round((m.current_yes_price ?? 0.5) * 100);
      yesLabel = m.yes_label || "Sí";
      noLabel = m.no_label || "No";
      category = m.category || "";
    }
  } catch {}

  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: BG, padding: 64, justifyContent: "space-between", fontFamily: "sans-serif" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", width: 40, height: 40, borderRadius: 10, background: ACCENT }} />
            <div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: INK }}>Pulso</div>
          </div>
          {category ? (
            <div style={{ display: "flex", fontSize: 22, color: MUTED, textTransform: "uppercase", letterSpacing: 2 }}>{category}</div>
          ) : <div style={{ display: "flex" }} />}
        </div>

        {/* Question */}
        <div style={{ display: "flex", fontSize: 60, fontWeight: 700, color: INK, lineHeight: 1.1, maxWidth: 1000 }}>
          {title.length > 120 ? title.slice(0, 117) + "…" : title}
        </div>

        {/* Odds bar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", fontSize: 32, fontWeight: 600, color: INK }}>{yesLabel}</div>
            <div style={{ display: "flex", fontSize: 32, fontWeight: 600, color: MUTED }}>{noLabel}</div>
          </div>
          <div style={{ display: "flex", width: "100%", height: 28, borderRadius: 14, background: "#e7e3de", overflow: "hidden" }}>
            <div style={{ display: "flex", width: `${yes}%`, height: "100%", background: ACCENT }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", fontSize: 44, fontWeight: 800, color: ACCENT }}>{yes}%</div>
            <div style={{ display: "flex", fontSize: 44, fontWeight: 800, color: MUTED }}>{100 - yes}%</div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
