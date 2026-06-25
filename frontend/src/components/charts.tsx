"use client";

import { useEffect, useRef, useState } from "react";
import { clamp, pct } from "@/lib/format";

export type Point = { t: number | string | Date; p: number };

export function LineChart({
  data, height = 220, accent = "#A41F13", showAxes = true, fill = true,
}: { data: Point[]; height?: number; accent?: string; showAxes?: boolean; fill?: boolean }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(600);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setW(Math.max(280, Math.floor(e.contentRect.width)));
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  if (!data || data.length === 0) {
    return <div ref={wrapRef} className="w-full h-[220px] grid place-items-center text-xs text-ink-400 dark:text-ink-500">No data yet</div>;
  }

  const padL = showAxes ? 36 : 4;
  const padR = 8, padT = 14, padB = showAxes ? 22 : 4;
  const innerW = w - padL - padR;
  const innerH = height - padT - padB;

  const xs = data.map((_, i) => padL + (i / Math.max(data.length - 1, 1)) * innerW);
  const ys = data.map((d) => padT + (1 - clamp(d.p, 0, 1)) * innerH);
  const path = xs.map((x, i) => `${i ? "L" : "M"}${x},${ys[i]}`).join(" ");
  const area = `${path} L${xs[xs.length - 1]},${padT + innerH} L${xs[0]},${padT + innerH} Z`;

  const last = data[data.length - 1].p;
  const first = data[0].p;
  const trendColor = last - first >= 0 ? "#2D6A4F" : "#A41F13";

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const i = clamp(Math.round(((x - padL) / innerW) * (data.length - 1)), 0, data.length - 1);
    setHover({ i, x: xs[i], y: ys[i] });
  };

  return (
    <div ref={wrapRef} className="w-full select-none" onMouseLeave={() => setHover(null)}>
      <svg width={w} height={height} onMouseMove={onMove}>
        <defs>
          <linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%"  stopColor={accent} stopOpacity="0.18" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>
        {showAxes && [0, 0.25, 0.5, 0.75, 1].map((g, i) => {
          const y = padT + (1 - g) * innerH;
          return (
            <g key={i}>
              <line x1={padL} x2={padL + innerW} y1={y} y2={y}
                    stroke="currentColor" className="text-ink-100 dark:text-ink-800" strokeDasharray="2 4"/>
              <text x={padL - 6} y={y + 3} textAnchor="end"
                    className="num fill-ink-400 dark:fill-ink-500" fontSize="10">
                {(g * 100).toFixed(0)}%
              </text>
            </g>
          );
        })}
        {fill && <path d={area} fill="url(#chartFill)"/>}
        <path d={path} fill="none" stroke={accent} strokeWidth="1.8"/>
        <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r="3.5" fill={accent}/>
        <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r="6" fill={accent} fillOpacity="0.18"/>
        {hover && (
          <g>
            <line x1={hover.x} x2={hover.x} y1={padT} y2={padT + innerH}
                  stroke="currentColor" className="text-ink-300 dark:text-ink-700" strokeDasharray="3 3"/>
            <circle cx={hover.x} cy={hover.y} r="4" fill="white" stroke={accent} strokeWidth="2"/>
          </g>
        )}
      </svg>
      {hover && (
        <div className="flex justify-between items-center text-xs text-ink-500 dark:text-ink-400 -mt-1 px-2">
          <span className="num">{new Date(data[hover.i].t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          <span className="num font-medium" style={{ color: trendColor }}>{pct(data[hover.i].p, 1)}</span>
        </div>
      )}
    </div>
  );
}

export function Sparkline({ data, w = 120, h = 36, accent = "#A41F13" }:
  { data: Point[]; w?: number; h?: number; accent?: string }) {
  if (!data || data.length < 2) return null;
  const xs = data.map((_, i) => (i / (data.length - 1)) * (w - 2) + 1);
  const ys = data.map((d) => (1 - clamp(d.p, 0, 1)) * (h - 2) + 1);
  const path = xs.map((x, i) => `${i ? "L" : "M"}${x},${ys[i]}`).join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <path d={path} fill="none" stroke={accent} strokeWidth="1.5" />
    </svg>
  );
}

export function ProbDial({ p, size = 56, stroke = 5 }: { p: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * clamp(p, 0, 1);
  const color = p >= 0.5 ? "#2D6A4F" : "#A41F13";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r}
              stroke="currentColor" className="text-ink-100 dark:text-ink-800"
              strokeWidth={stroke} fill="none"/>
      <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke}
              fill="none" strokeDasharray={`${dash} ${c}`} strokeLinecap="round"/>
    </svg>
  );
}
