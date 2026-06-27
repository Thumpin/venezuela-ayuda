"use client";

import { useState } from "react";
import { decideMerge } from "@/app/admin/actions";
import MergeCandidateRow from "@/components/admin/MergeCandidateRow";
import type { MergeClusterGroupData } from "@/lib/mergeClusters";
import type { MergeSide } from "@/lib/admin";

const TIER_LABEL: Record<MergeClusterGroupData["tier"], { text: string; cls: string }> = {
  HARD: { text: "Casi seguro", cls: "bg-emerald-100 text-emerald-700" },
  STRONG: { text: "Muy probable", cls: "bg-amber-100 text-amber-700" },
  REVIEW: { text: "Revisar", cls: "bg-slate-200 text-slate-600" },
};

function MemberThumb({ side, n }: { side: MergeSide; n: number }) {
  return (
    <div className="flex w-20 shrink-0 flex-col items-center text-center">
      {side.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={side.photo_url} alt={side.name} className="h-16 w-16 rounded-xl bg-slate-900 object-cover shadow-sm ring-1 ring-[#e6ecf2]" loading="lazy" />
      ) : (
        <div className="flex h-16 w-16 items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 text-[10px] font-medium text-[#8190a0]">
          Sin foto
        </div>
      )}
      <span className="mt-1 w-full truncate text-[11px] font-medium text-[#14212e]" title={side.name}>
        {n}. {side.name}
      </span>
    </div>
  );
}

// One block of 3+ records the engine linked (transitively) as likely the same
// person. Shows them all at a glance, then the underlying pair comparisons using
// chambaDigital's existing MergeCandidateRow — so every decision still goes
// through the same flow, unchanged.
export default function MergeClusterGroup({
  cluster,
  onDone,
}: {
  cluster: MergeClusterGroupData;
  onDone?: () => void;
}) {
  const tier = TIER_LABEL[cluster.tier];
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fast path for the common case: mark every comparison in the block as a
  // duplicate at once. Identical semantics to clicking "Marcar como duplicado"
  // on each pair — just batched.
  async function markAllDuplicate() {
    setPending(true);
    setError(null);
    try {
      for (const p of cluster.pairs) {
        const res = await decideMerge(p.id, "duplicate");
        if (!res.ok) {
          setError(res.error ?? "No se pudo guardar el lote.");
          setPending(false);
          return;
        }
      }
      setDone(cluster.pairs.length);
      setTimeout(() => onDone?.(), 300);
    } catch {
      setError("No se pudo guardar el lote.");
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border-2 border-emerald-200 bg-white p-5 text-center text-sm text-[#8190a0] shadow-[0_0_20px_-4px_rgba(16,185,129,0.15)]">
        <div className="mb-1 text-lg text-emerald-500">✓</div>
        <p className="text-[#14212e]">
          Bloque de <span className="font-semibold">{cluster.members.length}</span> registros resuelto —{" "}
          {done} comparación(es) marcadas como duplicado.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-sky-200 bg-sky-50/40 p-3 shadow-sm sm:p-4">
      {/* Block header */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-700">
            👥 Posible misma persona
          </span>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${tier.cls}`}>{tier.text}</span>
          <span className="text-xs font-medium text-[#5b6b7b]">
            {cluster.members.length} registros · {cluster.pairs.length} comparación(es)
          </span>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={markAllDuplicate}
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 active:scale-[0.98] disabled:opacity-50"
          title="Marca de una vez todas las comparaciones del bloque como duplicado"
        >
          {pending ? "Guardando…" : `Todas son la misma (${cluster.pairs.length})`}
        </button>
      </div>

      {/* Members at a glance */}
      <div className="mb-3 flex gap-3 overflow-x-auto rounded-xl bg-white/70 p-3 ring-1 ring-sky-100">
        {cluster.members.map((m, i) => (
          <MemberThumb key={m.id} side={m} n={i + 1} />
        ))}
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
          {error}
        </div>
      )}

      {/* Underlying pair comparisons — chambaDigital's row, unchanged */}
      <div className="space-y-3">
        {cluster.pairs.map((p, i) => (
          <div key={p.id}>
            <p className="mb-1.5 pl-1 text-[11px] font-semibold uppercase tracking-wide text-[#8190a0]">
              Comparación {i + 1} de {cluster.pairs.length}
            </p>
            <MergeCandidateRow item={p} onDone={onDone} />
          </div>
        ))}
      </div>
    </div>
  );
}
