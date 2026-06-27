"use client";

import { useState } from "react";
import { releaseAssignments } from "@/app/admin/actions";
import MergeCandidateRow from "@/components/admin/MergeCandidateRow";
import MergeClusterGroup from "@/components/admin/MergeClusterGroup";
import { buildClusters } from "@/lib/mergeClusters";
import type { MergeCandidate } from "@/lib/admin";

export default function MergeCandidateList({ candidates }: { candidates: MergeCandidate[] }) {
  const [search, setSearch] = useState("");
  const [releasing, setReleasing] = useState(false);
  const filtered = candidates.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [c.keep.name, c.dup.name, c.keep.message, c.dup.message, c.keep.place_name, c.dup.place_name, c.keep.source, c.dup.source]
      .some((v) => v?.toLowerCase().includes(q));
  });

  // Group transitive duplicates (A↔B, B↔C…) into blocks; lone pairs stay as-is.
  const { clusters, singles } = buildClusters(filtered);
  const reRender = () => setSearch((s) => s);

  async function handleRelease() {
    setReleasing(true);
    try { await releaseAssignments(); } finally { setReleasing(false); }
  }

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8190a0]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, lugar, fuente…"
            className="w-full rounded-xl border-2 border-[#e6ecf2] bg-white py-2.5 pl-10 pr-4 text-sm text-[#14212e] placeholder-[#8190a0] transition focus:border-[#8190a0] focus:outline-none" />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-[#8190a0]">
            {filtered.length} de {candidates.length}
            {clusters.length > 0 && (
              <span className="ml-1 text-sky-600">· {clusters.length} bloque(s)</span>
            )}
          </span>
          <button type="button" disabled={releasing} onClick={handleRelease}
            className="rounded-lg border border-[#e6ecf2] bg-white px-3 py-2 text-xs font-medium text-[#5b6b7b] transition hover:bg-slate-50 disabled:opacity-50">
            {releasing ? "…" : "Liberar lote"}
          </button>
        </div>
      </div>

      {/* What each action means — the labels alone aren't obvious. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-[#e6ecf2] bg-slate-50 px-3 py-2.5 text-xs text-[#5b6b7b]">
        <span className="font-semibold text-[#14212e]">Qué hace cada botón:</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm border border-red-300 bg-red-100" />
          <strong className="text-[#14212e]">Duplicado</strong>: misma persona — se queda <strong>A</strong>, se oculta <strong>B</strong>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm border border-emerald-300 bg-emerald-100" />
          <strong className="text-[#14212e]">Consolidar</strong>: misma persona — se queda <strong>B</strong>, se oculta <strong>A</strong>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm border border-slate-300 bg-white" />
          <strong className="text-[#14212e]">No estoy seguro</strong>: no oculta nada, queda para después
        </span>
        <span className="text-[#8190a0]">· Nada se borra: ocultar es reversible.</span>
      </div>

      <div className="mt-4 space-y-4">
        {/* Blocks first (a person reported 3-4 times), then lone pairs. */}
        {clusters.map((cl) => (
          <MergeClusterGroup key={cl.id} cluster={cl} onDone={reRender} />
        ))}
        {singles.map((c) => (
          <MergeCandidateRow key={c.id} item={c} onDone={reRender} />
        ))}
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-[#8190a0]">No se encontraron candidatos.</p>
        )}
      </div>
    </>
  );
}
