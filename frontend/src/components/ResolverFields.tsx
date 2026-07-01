"use client";

import { useEffect, useState } from "react";

export type ResolverType = "manual" | "llm_search" | "json_api";

const inp = "w-full h-10 px-3 rounded-lg border border-ink-200 dark:border-ink-800 bg-transparent text-sm";

/** Selector de resolver + sus campos. Auto-gestiona su estado (inicializado desde
 *  `initial`) y emite la config lista (o null para manual) por onChange. */
export function ResolverFields({
  initial, onChange, defaultType = "manual",
}: {
  initial?: Record<string, any> | null;
  onChange: (cfg: Record<string, any> | null) => void;
  defaultType?: ResolverType;
}) {
  const [type, setType] = useState<ResolverType>((initial?.type as ResolverType) || defaultType);
  const [llmSources, setLlmSources] = useState<string>((initial?.primary_sources || []).join(", "));
  const [llmExtras, setLlmExtras] = useState<string>(initial?.prompt_extras || "");
  const [apiUrl, setApiUrl] = useState<string>(initial?.url || "");
  const [apiPath, setApiPath] = useState<string>(initial?.jsonpath || "$");
  const [apiComp, setApiComp] = useState<string>(initial?.comparator || ">=");
  const [apiThreshold, setApiThreshold] = useState<string>(initial?.threshold != null ? String(initial.threshold) : "");
  const [apiHours, setApiHours] = useState<string>(String(initial?.auto_finalize_hours ?? 24));

  useEffect(() => {
    let cfg: Record<string, any> | null = null;
    if (type === "llm_search") {
      cfg = { type: "llm_search" };
      const src = llmSources.split(",").map((s) => s.trim()).filter(Boolean);
      if (src.length) cfg.primary_sources = src;
      if (llmExtras.trim()) cfg.prompt_extras = llmExtras.trim();
    } else if (type === "json_api") {
      cfg = {
        type: "json_api", url: apiUrl.trim(), jsonpath: apiPath.trim() || "$",
        comparator: apiComp, threshold: parseFloat(apiThreshold),
        auto_finalize_hours: parseInt(apiHours, 10) || 24,
      };
    }
    onChange(cfg);
  }, [type, llmSources, llmExtras, apiUrl, apiPath, apiComp, apiThreshold, apiHours]); // eslint-disable-line

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {([["manual", "Manual"], ["llm_search", "Asistida IA"], ["json_api", "API de datos"]] as const).map(([v, l]) => (
          <button key={v} type="button" onClick={() => setType(v)}
            className={`h-9 rounded-lg border text-xs font-medium ${type === v ? "border-accent-500 bg-accent-500/10 text-accent-500" : "border-ink-200 dark:border-ink-800"}`}>{l}</button>
        ))}
      </div>

      {type === "manual" && (
        <p className="text-[11px] text-ink-400 dark:text-ink-500">Se resuelve a mano en la cola de resoluciones al cerrar.</p>
      )}

      {type === "llm_search" && (
        <>
          <p className="text-[11px] text-ink-400 dark:text-ink-500">Al cerrar, la IA <strong>busca el resultado en la web</strong> y lo propone con fuentes; el admin confirma. Requiere <span className="mono">LLM_RESOLVER_API_KEY</span>; si no, cae a la cola manual.</p>
          <Lbl>Fuentes primarias (URLs separadas por coma) — opcional</Lbl>
          <input value={llmSources} onChange={(e) => setLlmSources(e.target.value)} className={inp} placeholder="conmebol.com, ..."/>
          <Lbl>Guía extra para la IA — opcional</Lbl>
          <textarea rows={2} value={llmExtras} onChange={(e) => setLlmExtras(e.target.value)} className={`${inp} resize-y`} placeholder="Ej. usar el resultado oficial de CONMEBOL."/>
        </>
      )}

      {type === "json_api" && (
        <>
          <p className="text-[11px] text-ink-400 dark:text-ink-500">Consulta una URL JSON y compara un valor contra un umbral. Se auto-finaliza a las N horas si nadie disputa.</p>
          <Lbl>URL de datos (JSON)</Lbl>
          <input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} className={inp} placeholder="https://api.ejemplo.com/..."/>
          <div className="grid grid-cols-2 gap-3">
            <div><Lbl>Campo (JSONPath)</Lbl><input value={apiPath} onChange={(e) => setApiPath(e.target.value)} className={inp} placeholder="$.price"/></div>
            <div><Lbl>Comparador</Lbl>
              <select value={apiComp} onChange={(e) => setApiComp(e.target.value)} className={inp}>
                {[">=", "<=", ">", "<", "==", "!="].map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Lbl>Umbral</Lbl><input type="number" value={apiThreshold} onChange={(e) => setApiThreshold(e.target.value)} className={inp}/></div>
            <div><Lbl>Auto-finaliza (horas)</Lbl><input type="number" min="1" value={apiHours} onChange={(e) => setApiHours(e.target.value)} className={inp}/></div>
          </div>
          <p className="text-[11px] text-ink-400 dark:text-ink-500 mono">Resuelve SÍ si {apiPath || "$"} {apiComp} umbral; NO si no.</p>
        </>
      )}
    </div>
  );
}

function Lbl({ children }: { children: React.ReactNode }) {
  return <span className="block text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1 mt-1">{children}</span>;
}
