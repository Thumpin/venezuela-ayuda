"use client";

import { useEffect, useRef, useState } from "react";
import { decideMerge } from "@/app/admin/actions";
import { timeAgo } from "@/lib/format";
import type { MergeCandidate, MergeSide } from "@/lib/admin";

const TIER_LABEL: Record<MergeCandidate["tier"], { text: string; cls: string }> = {
  HARD: { text: "Casi seguro", cls: "bg-emerald-100 text-emerald-700" },
  STRONG: { text: "Muy probable", cls: "bg-amber-100 text-amber-700" },
  REVIEW: { text: "Revisar", cls: "bg-slate-200 text-slate-600" },
};

function MatchBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
      <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
      </svg>
      {label}
    </span>
  );
}

function Field({ k, v, match }: { k: string; v: string; match?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 rounded-md px-2 py-1.5 transition hover:bg-white/50">
      <dt className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-[#8190a0]">{k}</dt>
      <dd className={`min-w-0 break-words text-sm ${match ? "font-semibold text-emerald-600" : "text-[#14212e]"}`}>
        {v}{match && <span className="ml-1 text-emerald-400">✓</span>}
      </dd>
    </div>
  );
}

function Side({ side, tag, onZoom }: { side: MergeSide; tag: string; onZoom: (url: string) => void }) {
  const hasPhoto = Boolean(side.photo_url);
  return (
    <div className="min-w-0 flex-1 rounded-2xl border-2 border-[#e6ecf2] bg-white p-0 shadow-sm">
      <div className="flex items-center gap-2 border-b border-[#e6ecf2] bg-slate-50 px-3 py-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-xs font-bold text-[#14212e] shadow-sm ring-1 ring-[#e6ecf2]">{tag}</span>
        <h4 className="min-w-0 truncate text-sm font-bold text-[#14212e]">{side.name}</h4>
      </div>
      <div className="p-2.5 sm:p-3">
        {hasPhoto ? (
          <button type="button" onClick={() => onZoom(side.photo_url!)}
            className="group relative block w-full overflow-hidden rounded-xl bg-slate-900 shadow-md transition hover:shadow-lg" title="Ampliar foto">
            <img src={side.photo_url ?? undefined} alt={side.name} className="h-36 w-full object-contain sm:h-56" loading="lazy" />
            <div className="absolute inset-0 bg-black/0 transition group-hover:bg-black/10" />
            <span className="absolute bottom-2 right-2 rounded-lg bg-black/70 px-2.5 py-1 text-[11px] font-medium text-white opacity-0 backdrop-blur-sm transition group-hover:opacity-100">🔍 Click para ampliar</span>
            {side.source && <span className="absolute left-2 top-2 rounded-lg bg-black/60 px-2 py-1 text-[10px] font-medium text-white/90 backdrop-blur-sm">{side.source}</span>}
          </button>
        ) : (
          <div className="flex h-24 w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 sm:h-40">
            <svg className="h-6 w-6 text-slate-300 sm:h-8 sm:w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
            </svg>
            <span className="text-[11px] font-medium text-[#8190a0] sm:text-xs">Sin foto disponible</span>
          </div>
        )}
        <div className="mt-2 divide-y divide-[#eef2f6] sm:mt-3">
          <Field k="Zona" v={side.place_name || side.city || "—"} />
          {side.message && <Field k="Detalle" v={side.message} />}
          <Field k="Teléfono" v={side.has_phone ? "Sí registrado" : "No registrado"} />
          <Field k="Fuente" v={side.source || "—"} />
          <Field k="Reportado" v={timeAgo(side.created_at)} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${hasPhoto ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${hasPhoto ? "bg-emerald-400" : "bg-slate-300"}`} />
            {hasPhoto ? "Con foto" : "Sin foto"}
          </span>
          {side.has_phone && (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-600">Tiene teléfono</span>
          )}
        </div>
      </div>
    </div>
  );
}

function MatchBar({ score }: { score: number; reason: string }) {
  const hue = score >= 0.8 ? 142 : score >= 0.5 ? 38 : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className="rounded-full transition-all duration-300" style={{ width: `${score * 100}%`, backgroundColor: `hsl(${hue}, 70%, 50%)` }} />
      </div>
      <span className="whitespace-nowrap text-xs font-semibold" style={{ color: `hsl(${hue}, 70%, 35%)` }}>{(score * 100).toFixed(0)}%</span>
    </div>
  );
}

export default function MergeCandidateRow({ item, onDone }: { item: MergeCandidate; onDone?: () => void }) {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<"duplicate" | "consolidate" | "skip" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
  const [showHints, setShowHints] = useState(true);
  const cardRef = useRef<HTMLDivElement>(null);
  const tier = TIER_LABEL[item.tier];
  const sameZone = item.keep.place_name === item.dup.place_name || item.keep.city === item.dup.city;
  const bothHavePhotos = Boolean(item.keep.photo_url && item.dup.photo_url);

  useEffect(() => {
    if (showHints) { const t = setTimeout(() => setShowHints(false), 4000); return () => clearTimeout(t); }
  }, [showHints]);

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setZoom(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "1" || e.key === "¡") { e.preventDefault(); decide("duplicate"); }
      if (e.key === "2" || e.key === '"') { e.preventDefault(); decide("consolidate"); }
      if (e.key === "3" || e.key === "#") { e.preventDefault(); decide("skip"); }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  });

  async function decide(decision: "duplicate" | "consolidate" | "skip") {
    setPending(true); setError(null);
    try {
      const res = await decideMerge(item.id, decision);
      if (res.ok) { setDone(decision); setTimeout(() => onDone?.(), 300); }
      else { setError(res.error ?? "No se pudo guardar."); setPending(false); }
    } catch { setError("No se pudo guardar."); setPending(false); }
  }

  if (done) {
    return (
      <div className={`rounded-2xl border bg-white p-5 text-center text-sm transition-all duration-500 ${
        done === "duplicate" ? "border-red-200"
        : done === "consolidate" ? "border-emerald-200 shadow-[0_0_20px_-4px_rgba(16,185,129,0.15)]"
        : "border-amber-200"
      }`}>
        <div className={`mb-1 text-lg ${done === "duplicate" ? "text-red-500" : done === "consolidate" ? "text-emerald-500" : "text-amber-400"}`}>
          {done === "skip" ? "⋯" : "✓"}
        </div>
        <p className="text-[#14212e]">
          <span className="font-semibold">{item.keep.name}</span>{" "}
          <span className="text-[#8190a0]">
            {done === "duplicate" ? "fue marcado como duplicado. El registro A se conservó."
            : done === "consolidate" ? "fue consolidado. El registro A se ocultó y B se conservó."
            : "fue saltado para revisar después."}
          </span>
        </p>
      </div>
    );
  }

  return (
    <div ref={cardRef} tabIndex={0}
      className="rounded-2xl border-2 border-[#e6ecf2] bg-white p-4 shadow-sm transition focus-within:border-[#8190a0] focus:outline-none sm:p-5">
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 sm:mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${tier.cls}`}>{tier.text}</span>
          <div className="w-24"><MatchBar score={item.confidence} reason={tier.text} /></div>
        </div>
        <div className={`hidden items-center gap-1.5 transition-opacity sm:flex ${showHints ? "opacity-100" : "opacity-40"}`}>
          <kbd className="rounded-md border border-[#e6ecf2] bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-[#8190a0] shadow-sm">1</kbd>
          <span className="text-[11px] text-[#8190a0]">dup</span>
          <kbd className="rounded-md border border-[#e6ecf2] bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-[#8190a0] shadow-sm">2</kbd>
          <span className="text-[11px] text-[#8190a0]">con</span>
          <kbd className="rounded-md border border-[#e6ecf2] bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-[#8190a0] shadow-sm">3</kbd>
          <span className="text-[11px] text-[#8190a0]">skip</span>
        </div>
      </div>

      {/* Match badges */}
      <div className="mb-3 flex flex-wrap gap-1.5 sm:mb-4 sm:gap-2">
        {sameZone && <MatchBadge label="Misma zona" />}
        {(item.evidence?.phone_match as boolean) && <MatchBadge label="Mismo teléfono" />}
        {bothHavePhotos && <MatchBadge label="Ambos con foto" />}
        {item.evidence?.cosine != null && (
          <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-600">
            IA: {(item.evidence.cosine as number * 100).toFixed(0)}% similar
          </span>
        )}
      </div>

      {/* A vs B */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch">
        <Side side={item.keep} tag="A" onZoom={() => setZoom(true)} />
        <div className="flex items-center justify-center sm:flex-col">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eef2f6] text-xs font-bold tracking-wider text-[#8190a0] shadow-sm ring-1 ring-white">VS</div>
        </div>
        <Side side={item.dup} tag="B" onZoom={() => setZoom(true)} />
      </div>

      {/* Lightbox */}
      {zoom && bothHavePhotos && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 overflow-y-auto bg-black/95 p-4 sm:flex-row sm:gap-4"
          onClick={() => setZoom(false)} role="dialog" aria-modal="true">
          {[item.keep, item.dup].map((s, i) => (
            <figure key={i} className="flex w-full max-w-md flex-col items-center sm:max-h-full sm:min-w-0 sm:flex-1">
              <figcaption className="mb-2 text-center text-sm font-semibold text-white sm:mb-3 sm:text-base">
                {i === 0 ? "A" : "B"} — <span className="text-white/80">{s.name}</span>
              </figcaption>
              {s.photo_url && <img src={s.photo_url} alt={s.name} className="max-h-[50vh] w-full rounded-xl object-contain shadow-2xl sm:max-h-[75vh]" />}
            </figure>
          ))}
          <button type="button"
            className="sticky bottom-0 mt-auto w-full rounded-xl bg-white/15 px-4 py-3 text-sm font-medium text-white backdrop-blur-md transition hover:bg-white/25 sm:absolute sm:bottom-4 sm:left-1/2 sm:w-auto sm:-translate-x-1/2 sm:py-2"
            onClick={() => setZoom(false)}>✗ Cerrar</button>
          <button type="button"
            className="absolute right-3 top-3 rounded-xl bg-white/10 px-3 py-2 text-xs font-medium text-white/60 backdrop-blur-sm transition hover:bg-white/20 sm:right-4 sm:top-4 sm:px-4 sm:py-2 sm:text-sm"
            onClick={() => setZoom(false)}>✗</button>
        </div>
      )}
      {zoom && !bothHavePhotos && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setZoom(false)} role="dialog" aria-modal="true">
          <div className="text-center text-white">
            <p className="text-lg font-semibold">No hay foto disponible para ampliar</p>
            <p className="mt-2 text-sm text-white/60">Haz clic para cerrar</p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button type="button" disabled={pending} onClick={() => decide("duplicate")}
          className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm font-medium text-red-700 transition hover:bg-red-100 active:scale-[0.98] disabled:opacity-50 sm:w-auto sm:py-1.5 sm:text-xs">
          Marcar como duplicado
        </button>
        <button type="button" disabled={pending} onClick={() => decide("consolidate")}
          className="w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100 active:scale-[0.98] disabled:opacity-50 sm:w-auto sm:py-1.5 sm:text-xs">
          Consolidar
        </button>
        <button type="button" disabled={pending} onClick={() => decide("skip")}
          className="w-full rounded-lg border border-[#e6ecf2] px-3 py-3 text-sm font-medium text-[#8190a0] transition hover:bg-slate-50 active:scale-[0.98] disabled:opacity-50 sm:w-auto sm:py-1.5 sm:text-xs">
          No estoy seguro
        </button>
      </div>

      {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600">{error}</div>}
    </div>
  );
}
