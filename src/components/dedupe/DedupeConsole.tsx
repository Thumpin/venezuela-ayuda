// Top-level review console. Holds the queue + selected group, debounced
// search, pagination, and auto-advance: when a group's pairs are all decided,
// it marks it done and moves to the next pending group automatically.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { listGroups, type GroupSummary } from "@/lib/dedupeApi";
import GroupQueue from "./GroupQueue";
import GroupReview from "./GroupReview";

const PAGE = 50;

export default function DedupeConsole() {
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  const [selected, setSelected] = useState<GroupSummary | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [reviewedCount, setReviewedCount] = useState(0);
  // Mobile: the queue lives in a slide-over drawer.
  const [queueOpen, setQueueOpen] = useState(false);

  // Select a group and close the mobile drawer (no-op on desktop).
  const selectGroup = useCallback((g: GroupSummary) => {
    setSelected(g);
    setQueueOpen(false);
  }, []);

  // Debounce search input.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Load (or reload on search change).
  const reqId = useRef(0);
  useEffect(() => {
    const id = ++reqId.current;
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    listGroups({ search: debounced, limit: PAGE, offset: 0, signal: controller.signal })
      .then((res) => {
        if (id !== reqId.current) return;
        setGroups(res.groups);
        setTotal(res.total);
        setOffset(res.groups.length);
        // Auto-select first group when nothing is selected yet.
        setSelected((cur) => cur ?? res.groups[0] ?? null);
      })
      .catch((e) => {
        if (e?.name !== "AbortError" && id === reqId.current)
          setError(e instanceof Error ? e.message : "Error al cargar grupos");
      })
      .finally(() => id === reqId.current && setLoading(false));
    return () => controller.abort();
  }, [debounced]);

  const loadMore = useCallback(() => {
    if (loading) return;
    const id = ++reqId.current;
    setLoading(true);
    listGroups({ search: debounced, limit: PAGE, offset })
      .then((res) => {
        if (id !== reqId.current) return;
        setGroups((prev) => [...prev, ...res.groups]);
        setOffset((prev) => prev + res.groups.length);
        setTotal(res.total);
      })
      .catch((e) =>
        id === reqId.current &&
        setError(e instanceof Error ? e.message : "Error al cargar más"),
      )
      .finally(() => id === reqId.current && setLoading(false));
  }, [debounced, offset, loading]);

  const advance = useCallback(
    (groupId: string) => {
      setCompletedIds((prev) => new Set(prev).add(groupId));
      setReviewedCount((n) => n + 1);
      // Move to the next not-yet-completed group in the queue.
      setGroups((cur) => {
        const idx = cur.findIndex((g) => g.group_id === groupId);
        const next = cur
          .slice(idx + 1)
          .find((g) => !completedIds.has(g.group_id) && g.group_id !== groupId);
        if (next) setSelected(next);
        return cur;
      });
    },
    [completedIds],
  );

  // Prev / next group navigation (← / → keys, and header buttons).
  const selectedIdx = useMemo(
    () => (selected ? groups.findIndex((g) => g.group_id === selected.group_id) : -1),
    [groups, selected],
  );
  const goPrev = useCallback(() => {
    if (selectedIdx > 0) setSelected(groups[selectedIdx - 1]);
  }, [groups, selectedIdx]);
  const goNext = useCallback(() => {
    if (selectedIdx >= 0 && selectedIdx < groups.length - 1)
      setSelected(groups[selectedIdx + 1]);
  }, [groups, selectedIdx]);

  useHotkeys(
    [
      { hotkey: "ArrowLeft", callback: () => goPrev() },
      { hotkey: "ArrowRight", callback: () => goNext() },
    ],
    { ignoreInputs: true, preventDefault: true },
  );

  const canLoadMore = groups.length < total;

  // Shared queue UI (same instance rendered in the desktop sidebar and the
  // mobile drawer).
  const queue = (
    <GroupQueue
      groups={groups}
      total={total}
      selectedId={selected?.group_id ?? null}
      completedIds={completedIds}
      search={search}
      loading={loading}
      onSearch={setSearch}
      onSelect={selectGroup}
      onLoadMore={loadMore}
      canLoadMore={canLoadMore}
    />
  );

  return (
    <div className="grid h-[calc(100dvh-7rem)] grid-cols-1 gap-3 sm:gap-4 lg:h-[calc(100dvh-8.5rem)] lg:grid-cols-[340px_1fr]">
      {/* Queue — fixed sidebar on desktop */}
      <aside className="hidden min-h-0 overflow-hidden rounded-2xl border border-[#e6ecf2] bg-white/80 lg:block">
        {queue}
      </aside>

      {/* Queue — slide-over drawer on mobile/tablet */}
      <Sheet open={queueOpen} onOpenChange={setQueueOpen}>
        <SheetContent side="left" className="w-[88vw] max-w-sm p-0">
          <SheetTitle className="sr-only">Lista de grupos</SheetTitle>
          {queue}
        </SheetContent>
      </Sheet>

      {/* Detail */}
      <section className="min-h-0 overflow-y-auto pr-0.5">
        {/* Mobile: open the group list */}
        <div className="mb-3 lg:hidden">
          <Sheet open={queueOpen} onOpenChange={setQueueOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="w-full justify-start">
                <Menu className="size-4" />
                Grupos
                <span className="ml-auto text-xs text-muted-foreground">
                  {total.toLocaleString("es")}
                </span>
              </Button>
            </SheetTrigger>
          </Sheet>
        </div>

        {selected && (
          <div className="mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-extrabold text-[#14212e]">
                  {selected.group_id}
                </h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-[#5b6b7b]">
                  {selected.record_count} registros
                </span>
                {completedIds.has(selected.group_id) && (
                  <span className="rounded-full bg-[#2f9e6e]/10 px-2 py-0.5 text-xs font-semibold text-[#2f9e6e]">
                    ✓ revisado
                  </span>
                )}
              </div>
              <p className="truncate text-sm text-[#5b6b7b]">
                {selected.sample_names.slice(0, 3).join(" · ")}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="hidden text-sm text-[#5b6b7b] sm:inline">
                Sesión:{" "}
                <strong className="text-[#14212e] tabular-nums">
                  {reviewedCount}
                </strong>
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={goPrev}
                disabled={selectedIdx <= 0}
                aria-label="Grupo anterior"
              >
                ←
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={goNext}
                disabled={selectedIdx < 0 || selectedIdx >= groups.length - 1}
                aria-label="Grupo siguiente"
              >
                →
              </Button>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-3 rounded-xl bg-[#e2603a]/10 px-4 py-3 text-sm text-[#c9483a]">
            {error}
          </div>
        )}

        {selected ? (
          <GroupReview
            key={selected.group_id}
            summary={selected}
            onComplete={advance}
          />
        ) : (
          !loading && (
            <div className="flex h-64 items-center justify-center rounded-2xl border border-[#e6ecf2] bg-white/70 text-[#5b6b7b]">
              Selecciona un grupo para empezar.
            </div>
          )
        )}
      </section>
    </div>
  );
}
