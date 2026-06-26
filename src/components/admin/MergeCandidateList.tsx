"use client";

import { useState } from "react";
import { releaseAssignments } from "@/app/admin/actions";
import MergeCandidateRow from "@/components/admin/MergeCandidateRow";
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
          </span>
          <button type="button" disabled={releasing} onClick={handleRelease}
            className="rounded-lg border border-[#e6ecf2] bg-white px-3 py-2 text-xs font-medium text-[#5b6b7b] transition hover:bg-slate-50 disabled:opacity-50">
            {releasing ? "…" : "Liberar lote"}
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {filtered.map((c) => (
          <MergeCandidateRow key={c.id} item={c} onDone={() => {
            setSearch((s) => s);
          }} />
        ))}
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-[#8190a0]">No se encontraron candidatos.</p>
        )}
      </div>
    </>
  );
}
