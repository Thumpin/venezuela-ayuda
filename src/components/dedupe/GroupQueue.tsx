// The browsable group list. Compact rows the reviewer can scan: names,
// location, how many records, how many duplicate clusters. Supports search and
// pagination, and marks groups already completed this session.
"use client";

import { Skeleton } from "@/components/ui/skeleton";
import type { GroupSummary } from "@/lib/dedupeApi";

export default function GroupQueue({
  groups,
  total,
  selectedId,
  completedIds,
  search,
  loading,
  onSearch,
  onSelect,
  onLoadMore,
  canLoadMore,
}: {
  groups: GroupSummary[];
  total: number;
  selectedId: string | null;
  completedIds: Set<string>;
  search: string;
  loading: boolean;
  onSearch: (q: string) => void;
  onSelect: (g: GroupSummary) => void;
  onLoadMore: () => void;
  canLoadMore: boolean;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[#e6ecf2] p-3">
        <label className="relative block">
          <span className="sr-only">Buscar grupos</span>
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5b6b7b]">
            🔍
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Buscar nombre, teléfono, lugar…"
            className="w-full rounded-lg border border-[#e6ecf2] bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#2563a8]"
          />
        </label>
        <p className="mt-2 px-1 text-[11px] uppercase tracking-wide text-[#5b6b7b]">
          {total.toLocaleString("es")} grupos
        </p>
      </div>

      <ul className="min-h-0 flex-1 divide-y divide-[#e6ecf2] overflow-y-auto">
        {groups.map((g) => {
          const active = g.group_id === selectedId;
          const done = completedIds.has(g.group_id);
          return (
            <li key={g.group_id}>
              <button
                type="button"
                onClick={() => onSelect(g)}
                aria-current={active ? "true" : undefined}
                className={`flex w-full items-start gap-2 px-3 py-2.5 text-left transition ${
                  active ? "bg-[#eaf2fb]" : "hover:bg-slate-50"
                }`}
                style={active ? { boxShadow: "inset 3px 0 0 #2563a8" } : undefined}
              >
                <span className="mt-0.5 shrink-0 text-base" aria-hidden>
                  {done ? "✅" : "•"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-[#14212e]">
                      {g.sample_names[0] || g.group_id}
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-[#5b6b7b]">
                      {g.record_count}
                    </span>
                  </span>
                  {g.sample_locations[0] && (
                    <span className="block truncate text-xs text-[#5b6b7b]">
                      {g.sample_locations[0]}
                    </span>
                  )}
                  <span className="mt-1 flex flex-wrap gap-1">
                    {g.duplicate_cluster_count > 0 && (
                      <span className="rounded bg-[#eaf2fb] px-1.5 py-0.5 text-[10px] font-medium text-[#2563a8]">
                        {g.duplicate_cluster_count} dup
                      </span>
                    )}
                    {g.family_record_count > 0 && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-[#5b6b7b]">
                        {g.family_record_count} familia
                      </span>
                    )}
                  </span>
                </span>
              </button>
            </li>
          );
        })}

        {loading &&
          [0, 1, 2, 3].map((i) => (
            <li key={`s${i}`} className="px-3 py-3">
              <Skeleton className="h-10 rounded" />
            </li>
          ))}

        {!loading && groups.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-[#5b6b7b]">
            Sin resultados.
          </li>
        )}
      </ul>

      {canLoadMore && (
        <div className="border-t border-[#e6ecf2] p-2">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loading}
            className="w-full rounded-lg border border-[#e6ecf2] bg-white py-2 text-sm font-semibold text-[#2563a8] transition hover:bg-[#eaf2fb] disabled:opacity-50"
          >
            {loading ? "Cargando…" : "Cargar más"}
          </button>
        </div>
      )}
    </div>
  );
}
