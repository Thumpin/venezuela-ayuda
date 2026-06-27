"use client";

import { useState } from "react";
import { decideMerge } from "@/app/admin/actions";
import { timeAgo } from "@/lib/format";
import type { MergeClusterGroupData } from "@/lib/mergeClusters";
import type { MergeSide } from "@/lib/admin";

const TIER_LABEL: Record<MergeClusterGroupData["tier"], { text: string; cls: string }> = {
  HARD: { text: "Casi seguro", cls: "bg-emerald-100 text-emerald-700" },
  STRONG: { text: "Muy probable", cls: "bg-amber-100 text-amber-700" },
  REVIEW: { text: "Revisar", cls: "bg-slate-200 text-slate-600" },
};

function Field({ k, v, highlight }: { k: string; v: string; highlight?: boolean }) {
  return (
    <div className="flex items-start gap-1.5 rounded-md px-2 py-1 transition hover:bg-slate-50">
      <dt className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-slate-400 mt-0.5">{k}</dt>
      <dd className={`min-w-0 break-words text-xs ${highlight ? "font-semibold text-emerald-600" : "text-slate-700"}`}>
        {v}
      </dd>
    </div>
  );
}

export default function MergeClusterGroup({
  cluster,
  onDone,
}: {
  cluster: MergeClusterGroupData;
  onDone?: () => void;
}) {
  const tier = TIER_LABEL[cluster.tier];
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Choose the first member as the default keeper
  const [keeperId, setKeeperId] = useState<string>(cluster.members[0]?.id || "");
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);

  async function handleResolve() {
    setPending(true);
    setError(null);
    try {
      // For each pair in the cluster, decide relative to the chosen keeperId
      for (const p of cluster.pairs) {
        let decision: "duplicate" | "consolidate" | "skip";
        
        if (p.keep.id === keeperId) {
          // p.keep is the keeper, so p.dup is a duplicate (hide dup)
          decision = "duplicate";
        } else if (p.dup.id === keeperId) {
          // p.dup is the keeper, so p.keep is a duplicate (hide keep)
          decision = "consolidate";
        } else {
          // Neither is the keeper. Both are duplicates. Marking as duplicate (hides dup).
          // The other record (keep) will be hidden by its pair comparison with the keeper.
          decision = "duplicate";
        }

        const res = await decideMerge(p.id, decision);
        if (!res.ok) {
          setError(res.error ?? "No se pudo procesar la resolución.");
          setPending(false);
          return;
        }
      }

      const keeperName = cluster.members.find(m => m.id === keeperId)?.name || "Registro seleccionado";
      setDone(keeperName);
      setTimeout(() => onDone?.(), 300);
    } catch {
      setError("Ocurrió un error inesperado al procesar el grupo.");
      setPending(false);
    }
  }

  async function handleSkip() {
    setPending(true);
    setError(null);
    try {
      for (const p of cluster.pairs) {
        const res = await decideMerge(p.id, "skip");
        if (!res.ok) {
          setError(res.error ?? "No se pudo saltar el lote.");
          setPending(false);
          return;
        }
      }
      setDone("skipped");
      setTimeout(() => onDone?.(), 300);
    } catch {
      setError("No se pudo saltar el lote.");
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className={`rounded-2xl border-2 p-5 text-center text-sm shadow-md bg-white transition-all duration-300 ${
        done === "skipped" ? "border-amber-200" : "border-emerald-200"
      }`}>
        <div className={`mb-1 text-lg ${done === "skipped" ? "text-amber-500" : "text-emerald-500"}`}>
          {done === "skipped" ? "⋯" : "✓"}
        </div>
        <p className="text-[#14212e]">
          {done === "skipped" ? (
            <span className="text-slate-500">Lote saltado para revisar después.</span>
          ) : (
            <>
              Grupo de <span className="font-semibold">{cluster.members.length}</span> registros resuelto.
              <span className="block text-xs text-slate-500 mt-1">Se conservó el registro de: <strong>{done}</strong> y se ocultaron los demás.</span>
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-sky-200 bg-sky-50/20 p-4 shadow-sm sm:p-5">
      {/* Block header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-sky-100 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-700">
            👥 Grupo de coincidencia
          </span>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${tier.cls}`}>{tier.text}</span>
          <span className="text-xs font-medium text-slate-500">
            {cluster.members.length} registros para comparar
          </span>
        </div>
        {cluster.confidence > 0 && (
          <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-md">
            Similitud máxima: {(cluster.confidence * 100).toFixed(0)}%
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
          {error}
        </div>
      )}

      {/* Side-by-side Members Comparison Grid */}
      <div className={`grid gap-4 grid-cols-1 md:grid-cols-${Math.min(cluster.members.length, 3)}`}>
        {cluster.members.map((m) => {
          const isSelected = keeperId === m.id;
          const hasPhoto = Boolean(m.photo_url);

          return (
            <div
              key={m.id}
              onClick={() => setKeeperId(m.id)}
              className={`cursor-pointer rounded-2xl border-2 transition-all duration-200 bg-white p-3 flex flex-col justify-between shadow-sm hover:shadow ${
                isSelected
                  ? "border-emerald-500 ring-2 ring-emerald-500/20"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <div>
                {/* Selector */}
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 mb-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`keeper-${cluster.id}`}
                      checked={isSelected}
                      onChange={() => setKeeperId(m.id)}
                      className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-slate-300"
                    />
                    <span className={`text-xs font-bold ${isSelected ? "text-emerald-700" : "text-slate-500"}`}>
                      {isSelected ? "🟢 Conservar este" : "Ocultar como duplicado"}
                    </span>
                  </div>
                  {isSelected && (
                    <span className="bg-emerald-50 text-emerald-700 font-bold text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-md border border-emerald-100">
                      Principal
                    </span>
                  )}
                </div>

                {/* Photo */}
                {hasPhoto ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setZoomUrl(m.photo_url);
                    }}
                    className="group relative block w-full overflow-hidden rounded-xl bg-slate-900 shadow-sm border border-slate-100"
                    title="Ampliar foto"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.photo_url!} alt={m.name} className="h-32 w-full object-cover" />
                    <div className="absolute inset-0 bg-black/0 transition group-hover:bg-black/10" />
                    <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1.5 py-0.5 text-[9px] font-semibold text-white backdrop-blur-sm">
                      🔍 Ampliar
                    </span>
                  </button>
                ) : (
                  <div className="flex h-32 w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
                    <span className="text-[10px] font-medium text-slate-400">Sin foto disponible</span>
                  </div>
                )}

                {/* Details */}
                <div className="mt-3 space-y-1">
                  <Field k="Nombre" v={m.name} highlight={isSelected} />
                  <Field k="Zona" v={m.place_name || m.city || "—"} />
                  {m.message && <Field k="Detalle" v={m.message} />}
                  <Field k="Teléfono" v={m.has_phone ? "Sí registrado" : "No registrado"} />
                  <Field k="Fuente" v={m.source || "Web"} />
                  <Field k="Fecha" v={timeAgo(m.created_at)} />
                </div>
              </div>

              {/* Status Badge */}
              <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Origen: <strong className="text-slate-600">{m.source || "público"}</strong></span>
                {isSelected ? (
                  <span className="text-emerald-700 font-semibold">Se mantendrá visible</span>
                ) : (
                  <span className="text-rose-600 font-medium">Se ocultará</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Global Actions */}
      <div className="mt-5 flex flex-wrap gap-2.5 justify-end border-t border-sky-100 pt-4">
        <button
          type="button"
          disabled={pending}
          onClick={handleSkip}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-50 active:scale-[0.98] disabled:opacity-50"
        >
          No estoy seguro (Saltar lote)
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={handleResolve}
          className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-5 py-2 text-xs font-bold text-white shadow transition active:scale-[0.98] disabled:opacity-50"
        >
          {pending ? "Guardando..." : "✅ Resolver Duplicados del Grupo"}
        </button>
      </div>

      {/* Photo Lightbox */}
      {zoomUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setZoomUrl(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="relative max-w-2xl w-full flex flex-col items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setZoomUrl(null)}
              className="absolute -top-3 -right-3 z-10 h-8 w-8 rounded-full bg-white shadow-lg flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition font-bold text-sm"
            >
              ✕
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={zoomUrl} alt="Foto ampliada" className="max-h-[80vh] w-full rounded-2xl object-contain shadow-2xl" />
          </div>
        </div>
      )}
    </div>
  );
}
