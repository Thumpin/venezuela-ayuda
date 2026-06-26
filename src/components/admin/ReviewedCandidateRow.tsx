"use client";

import { useState } from "react";
import { decideMerge, reopenMerge } from "@/app/admin/actions";
import { timeAgo } from "@/lib/format";
import type { MergeSide, ReviewedCandidate } from "@/lib/admin";

const DECISION_LABEL: Record<string, { text: string; cls: string }> = {
  MERGED: { text: "Duplicado confirmado", cls: "bg-red-100 text-red-700" },
  SKIPPED: { text: "Saltado", cls: "bg-amber-100 text-amber-700" },
};

function MiniSide({ side, tag }: { side: MergeSide; tag: string }) {
  const hasPhoto = Boolean(side.photo_url);
  return (
    <div className="min-w-0 flex-1 rounded-xl border border-[#e6ecf2] bg-white p-0 shadow-sm">
      <div className="flex items-center gap-2 border-b border-[#eef2f6] bg-slate-50 px-3 py-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white text-[10px] font-bold text-[#14212e] shadow-sm ring-1 ring-[#e6ecf2]">
          {tag}
        </span>
        <h4 className="min-w-0 truncate text-sm font-bold text-[#14212e]">{side.name}</h4>
      </div>
      <div className="p-2.5">
        {hasPhoto ? (
          <img src={side.photo_url!} alt={side.name} className="h-24 w-full rounded-lg bg-slate-900 object-contain sm:h-32" loading="lazy" />
        ) : (
          <div className="flex h-16 w-full items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 sm:h-20">
            <span className="text-[11px] font-medium text-[#8190a0]">Sin foto</span>
          </div>
        )}
        <dl className="mt-2 divide-y divide-[#eef2f6] text-xs">
          <MiniField k="Zona" v={side.place_name || side.city || "—"} />
          <MiniField k="Fuente" v={side.source || "—"} />
          <MiniField k="Teléfono" v={side.has_phone ? "Sí" : "No"} />
          <MiniField k="Reportado" v={timeAgo(side.created_at)} />
        </dl>
      </div>
    </div>
  );
}

function MiniField({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1">
      <dt className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-[#8190a0]">{k}</dt>
      <dd className="min-w-0 break-words text-[#14212e]">{v}</dd>
    </div>
  );
}

export default function ReviewedCandidateRow({ item }: { item: ReviewedCandidate }) {
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const label = DECISION_LABEL[item.status] ?? { text: item.status, cls: "bg-slate-100 text-slate-600" };
  const sameZone = item.keep.place_name === item.dup.place_name || item.keep.city === item.dup.city;

  async function handleReopen() {
    setPending(true); setError(null);
    const res = await reopenMerge(item.id);
    if (res.ok) { setMessage("Reabierto — aparece en Pendientes."); setExpanded(false); }
    else { setError(res.error ?? "Error."); }
    setPending(false);
  }

  async function handleDecide(decision: "duplicate" | "consolidate") {
    setPending(true); setError(null);
    const res = await decideMerge(item.id, decision);
    if (res.ok) { setMessage("Decisión actualizada."); setExpanded(false); }
    else { setError(res.error ?? "Error."); }
    setPending(false);
  }

  return (
    <div className="rounded-xl border border-[#e6ecf2] bg-white transition hover:border-[#d0d7e0]">
      <button
        type="button"
        onClick={() => { if (!message) setExpanded(!expanded); }}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${label.cls}`}>{label.text}</span>
          <span className="text-sm font-medium text-[#14212e]">{item.keep.name}</span>
          <span className="text-[11px] text-[#8190a0]">vs {item.dup.name}</span>
          {item.decision && <span className="text-[11px] text-[#5b6b7b]">· {item.decision === "duplicate" ? "duplicado" : item.decision === "consolidate" ? "consolidado" : "saltado"}</span>}
          {item.decided_by && <span className="text-[11px] text-[#8190a0]">por {item.decided_by}</span>}
          {item.decided_at && <span className="text-[11px] text-[#8190a0]">{timeAgo(item.decided_at)}</span>}
        </div>
        <span className={`shrink-0 text-[10px] text-[#8190a0] transition-transform ${expanded ? "rotate-180" : ""}`}>▼</span>
      </button>

      {message && (
        <div className="border-t border-[#eef2f6] px-4 pb-4 pt-3">
          <div className={`rounded-xl px-4 py-3 text-sm ${error ? "border border-red-200 bg-red-50 text-red-700" : "border border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
            {error || message}
          </div>
        </div>
      )}

      {expanded && !message && (
        <div className="border-t border-[#eef2f6] px-4 pb-4 pt-3">
          {/* Match badges */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {sameZone && (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
                <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                Misma zona
              </span>
            )}
            {(item.evidence?.phone_match as boolean) && (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600">Mismo teléfono</span>
            )}
            {item.evidence?.cosine != null && (
              <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-600">
                IA: {(item.evidence.cosine as number * 100).toFixed(0)}% similar
              </span>
            )}
          </div>

          {/* A vs B */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
            <MiniSide side={item.keep} tag={`A · ${item.status === "MERGED" && item.decision === "consolidate" ? "oculto" : "conservado"}`} />
            <div className="flex items-center justify-center sm:flex-col">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#eef2f6] text-[10px] font-bold tracking-wider text-[#8190a0] shadow-sm ring-1 ring-white">VS</div>
            </div>
            <MiniSide side={item.dup} tag={`B · ${item.status === "MERGED" && item.decision === "duplicate" ? "oculto" : "conservado"}`} />
          </div>

          {/* Actions */}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={pending} onClick={() => handleDecide("duplicate")}
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 transition hover:bg-red-100 active:scale-[0.98] disabled:opacity-50">
              Marcar duplicado
            </button>
            <button type="button" disabled={pending} onClick={() => handleDecide("consolidate")}
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 active:scale-[0.98] disabled:opacity-50">
              Consolidar
            </button>
            <button type="button" disabled={pending} onClick={handleReopen}
              className="rounded-lg border border-[#e6ecf2] px-3 py-2 text-xs font-medium text-[#5b6b7b] transition hover:bg-slate-50 active:scale-[0.98] disabled:opacity-50">
              {pending ? "..." : "Reabrir"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
