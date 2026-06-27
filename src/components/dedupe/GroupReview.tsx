// Group-level cleaning canvas. The whole group is one screen: records are laid
// out grouped by the person the API proposes (duplicate clusters). Everything
// is KEPT by default; the reviewer removes the records that don't belong, then
// confirms — which fires the API writes and auto-advances.
//
// Keyboard:
//   1..9   toggle remove/keep on the Nth record
//   Enter  confirm group & next
//   F      flag whole group: nothing here is a duplicate (remove all but first)
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useHotkeys, type UseHotkeyDefinition } from "@tanstack/react-hotkeys";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import {
  buildPersonClusters,
  commitGroupReview,
  getGroup,
  type GroupDetail,
  type GroupSummary,
  type RecordSummary,
} from "@/lib/dedupeApi";
import RecordCard from "./RecordCard";

const TINTS = ["#2563a8", "#7c5cbf", "#0f8a8a", "#c2682e", "#b5446a", "#2f9e6e"];

export default function GroupReview({
  summary,
  onComplete,
}: {
  summary: GroupSummary;
  onComplete?: (groupId: string) => void;
}) {
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [committing, setCommitting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getGroup(summary.group_id, controller.signal)
      .then((d) => setDetail(d))
      .catch((e) => {
        if (e?.name !== "AbortError")
          setError(e instanceof Error ? e.message : "Error al cargar el grupo");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [summary.group_id]);

  const clusters = useMemo(
    () => buildPersonClusters(detail?.records ?? []),
    [detail],
  );

  // Flat, stable record order so digit hotkeys map to a visible number.
  const ordered = useMemo<RecordSummary[]>(
    () => clusters.flatMap((c) => c.records),
    [clusters],
  );
  const indexOf = useMemo(() => {
    const m = new Map<string, number>();
    ordered.forEach((r, i) => m.set(r.record_id, i + 1));
    return m;
  }, [ordered]);

  const toggle = useCallback((recordId: string) => {
    setRemoved((prev) => {
      const next = new Set(prev);
      if (next.has(recordId)) next.delete(recordId);
      else next.add(recordId);
      return next;
    });
  }, []);

  const keptCount = ordered.length - removed.size;

  const confirm = useCallback(async () => {
    if (!detail || committing) return;
    setCommitting(true);
    setError(null);
    try {
      const res = await commitGroupReview({
        groupId: summary.group_id,
        removedRecordIds: Array.from(removed),
        clusters,
      });
      if (res.errors.length) {
        setError(res.errors.slice(0, 2).join(" · "));
        setCommitting(false);
        return;
      }
      onComplete?.(summary.group_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo confirmar");
      setCommitting(false);
    }
  }, [detail, committing, summary.group_id, removed, clusters, onComplete]);

  // Flag the whole group as "not duplicates": keep only the first record of
  // each cluster, remove the rest (so no merges are confirmed).
  const flagNotDuplicates = useCallback(() => {
    const toRemove = new Set<string>();
    clusters.forEach((c) => {
      c.records.slice(1).forEach((r) => toRemove.add(r.record_id));
    });
    setRemoved(toRemove);
  }, [clusters]);

  // Keyboard handling via TanStack Hotkeys. `ignoreInputs` keeps the search box
  // usable. Digit hotkeys are built dynamically from the records, plus Enter to
  // confirm and F to flag the whole group. Arrows (prev/next group) live in the
  // parent console.
  const hotkeys = useMemo<UseHotkeyDefinition[]>(
    () => [
      { hotkey: "Enter", callback: () => confirm() },
      { hotkey: "F", callback: () => flagNotDuplicates() },
      ...ordered.slice(0, 9).map(
        (rec, i): UseHotkeyDefinition => ({
          hotkey: `${i + 1}` as UseHotkeyDefinition["hotkey"],
          callback: () => toggle(rec.record_id),
        }),
      ),
    ],
    [confirm, flagNotDuplicates, ordered, toggle],
  );
  useHotkeys(hotkeys, { ignoreInputs: true, preventDefault: true });

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-40 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (error && !detail) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="font-semibold text-destructive">{error}</p>
      </div>
    );
  }
  if (!detail) return null;

  const multiPersonNote =
    clusters.length > 1
      ? `Parece ${clusters.length} personas distintas`
      : clusters.length === 1
        ? "Parece 1 persona"
        : "";

  return (
    <div className="space-y-4">
      {/* Person blocks */}
      {clusters.map((cluster, ci) => {
        const tint = cluster.clusterId ? TINTS[ci % TINTS.length] : "#94a3b8";
        const isDuplicate = cluster.records.length > 1;
        return (
          <Card
            key={cluster.key}
            className="gap-0 overflow-hidden bg-white/85 py-0"
          >
            <header
              className="flex items-center justify-between gap-2 px-4 py-3"
              style={{ boxShadow: `inset 4px 0 0 ${tint}` }}
            >
              <div className="min-w-0">
                <h3 className="truncate text-base font-bold text-foreground">
                  {cluster.name}
                </h3>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {isDuplicate
                    ? `${cluster.records.length} reportes · misma persona`
                    : "1 reporte"}
                </p>
              </div>
              {isDuplicate && (
                <Badge
                  className="shrink-0"
                  style={{ backgroundColor: `${tint}1a`, color: tint }}
                >
                  duplicado
                </Badge>
              )}
            </header>
            <div className="space-y-2 px-3 pb-3">
              {cluster.records.map((r) => (
                <RecordCard
                  key={r.record_id}
                  record={r}
                  index={indexOf.get(r.record_id) ?? 0}
                  removed={removed.has(r.record_id)}
                  onToggle={() => toggle(r.record_id)}
                />
              ))}
            </div>
          </Card>
        );
      })}

      {multiPersonNote && (
        <p className="px-1 text-sm text-muted-foreground">{multiPersonNote}.</p>
      )}

      {error && (
        <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Sticky action bar */}
      <div className="sticky bottom-0 z-10 -mx-1 flex flex-col gap-2 rounded-2xl border border-border bg-white/95 px-3 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>
            <strong className="text-foreground tabular-nums">{keptCount}</strong> a
            conservar
          </span>
          {removed.size > 0 && (
            <span className="text-destructive">· {removed.size} a quitar</span>
          )}
          <KbdGroup className="hidden text-[11px] text-muted-foreground/80 lg:flex">
            <Kbd>1–9</Kbd> quitar · <Kbd>Enter</Kbd> confirmar · <Kbd>F</Kbd> no son
            duplicados
          </KbdGroup>
        </div>
        <div className="flex items-center gap-2">
          {removed.size > 0 && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setRemoved(new Set())}
              className="flex-1 sm:flex-none"
            >
              Deshacer
            </Button>
          )}
          <Button
            type="button"
            variant="success"
            size="lg"
            onClick={confirm}
            disabled={committing}
            className="flex-1 font-bold sm:flex-none"
          >
            {committing ? "Guardando…" : "Confirmar grupo →"}
          </Button>
        </div>
      </div>
    </div>
  );
}
