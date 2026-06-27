"use client";

import { useEffect, useMemo, useState } from "react";
import { decideCluster, deferCluster, requeueCluster } from "@/app/admin/actions";
import { timeAgo } from "@/lib/format";
import type { MergeCluster, MergeSide, MergeTier } from "@/lib/admin";

const TIER_LABEL: Record<MergeTier, { text: string; cls: string }> = {
  HARD: { text: "Casi seguro", cls: "bg-emerald-100 text-emerald-700" },
  STRONG: { text: "Muy probable", cls: "bg-amber-100 text-amber-700" },
  REVIEW: { text: "Revisar", cls: "bg-slate-200 text-slate-600" },
};

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-1.5">
      <dt className="shrink-0 font-medium text-[#8190a0]">{k}:</dt>
      <dd className="min-w-0 break-words">{v}</dd>
    </div>
  );
}

// One member of the block. The header carries the KEEP radio + (for non-keep
// members) a "same person?" checkbox; the body shows the photo and fields.
function MemberCard({
  side,
  isKeep,
  isDup,
  onKeep,
  onToggleDup,
  onZoom,
}: {
  side: MergeSide;
  isKeep: boolean;
  isDup: boolean;
  onKeep: () => void;
  onToggleDup: () => void;
  onZoom: (url: string) => void;
}) {
  const ring = isKeep
    ? "border-sky-300 ring-2 ring-sky-200"
    : isDup
      ? "border-[#e6ecf2]"
      : "border-dashed border-slate-300 opacity-70";
  return (
    <div className={`min-w-0 rounded-xl border bg-slate-50 p-3 ${ring}`}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex cursor-pointer items-center gap-1.5 rounded bg-white px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[#5b6b7b]">
          <input
            type="radio"
            checked={isKeep}
            onChange={onKeep}
            className="h-3.5 w-3.5 accent-sky-600"
          />
          Conservar
        </label>
        {!isKeep && (
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-[#5b6b7b]">
            <input
              type="checkbox"
              checked={isDup}
              onChange={onToggleDup}
              className="h-3.5 w-3.5 accent-emerald-600"
            />
            {isDup ? "misma persona" : "distinta"}
          </label>
        )}
        <h4 className="min-w-0 flex-1 truncate text-sm font-semibold text-[#14212e]">
          {side.name}
        </h4>
      </div>
      {side.photo_url ? (
        // The photo is the strongest signal a human has. Show it WHOLE
        // (object-contain) on a dark backdrop; click to open full-size.
        <button
          type="button"
          onClick={() => onZoom(side.photo_url!)}
          className="group relative mt-2 block w-full overflow-hidden rounded-lg bg-slate-900"
          title="Ampliar foto"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={side.photo_url}
            alt={side.name}
            className="h-56 w-full object-contain"
            loading="lazy"
          />
          <span className="pointer-events-none absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white opacity-0 transition group-hover:opacity-100">
            🔍 Ampliar
          </span>
        </button>
      ) : (
        <div className="mt-2 flex h-56 w-full items-center justify-center rounded-lg bg-slate-100 text-xs text-[#8190a0]">
          Sin foto
        </div>
      )}
      <dl className="mt-2 space-y-1 text-xs text-[#5b6b7b]">
        <Field k="Zona" v={side.place_name || side.city || "—"} />
        {side.message && <Field k="Descripción" v={side.message} />}
        <Field k="Teléfono" v={side.has_phone ? "sí (privado)" : "no"} />
        <Field k="Cédula" v={side.has_cedula ? "sí (privado)" : "no"} />
        <Field k="Fuente" v={side.source || "—"} />
        <Field k="Reportado" v={timeAgo(side.created_at)} />
      </dl>
    </div>
  );
}

export default function MergeClusterCard({
  cluster,
  deferred = false,
}: {
  cluster: MergeCluster;
  // true when shown in the "dudosos" lane: the block was set aside earlier, so
  // we offer "devolver a la cola" instead of "no estoy seguro".
  deferred?: boolean;
}) {
  const [keepId, setKeepId] = useState(cluster.suggestedKeepId);
  // Default: every non-keep member is assumed the same person (the common case).
  const [dupIds, setDupIds] = useState<Set<string>>(
    () => new Set(cluster.members.map((m) => m.id).filter((id) => id !== keepId)),
  );
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<
    | { kind: "decided"; merged: number; kept: string }
    | { kind: "deferred" }
    | { kind: "requeued" }
    | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  const tier = TIER_LABEL[cluster.tier];
  const cedulaSignal = cluster.pairs.some((p) => p.evidence?.cedula_match === true);

  // Esc closes the lightbox — fast keyboard flow while reviewing many blocks.
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoom(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  // When KEEP changes, that record can no longer be a duplicate of itself; the
  // previously-kept record rejoins the "same person" set by default.
  function chooseKeep(id: string) {
    setKeepId(id);
    setDupIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      if (keepId !== id) next.add(keepId);
      return next;
    });
  }

  function toggleDup(id: string) {
    setDupIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const checkedDups = useMemo(
    () => cluster.members.map((m) => m.id).filter((id) => dupIds.has(id) && id !== keepId),
    [cluster.members, dupIds, keepId],
  );

  const pairIds = useMemo(() => cluster.pairs.map((p) => p.id), [cluster.pairs]);

  // Wrap an action call: flip pending, surface errors, store the outcome on ok.
  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, outcome: typeof done) {
    setPending(true);
    setError(null);
    try {
      const res = await fn();
      if (res.ok) setDone(outcome);
      else {
        setError(res.error ?? "No se pudo guardar.");
        setPending(false);
      }
    } catch {
      setError("No se pudo guardar.");
      setPending(false);
    }
  }

  function submit() {
    return run(() => decideCluster(pairIds, keepId, checkedDups), {
      kind: "decided",
      merged: checkedDups.length,
      kept: cluster.members.find((m) => m.id === keepId)?.name ?? "el registro",
    });
  }
  function defer() {
    return run(() => deferCluster(pairIds), { kind: "deferred" });
  }
  function requeue() {
    return run(() => requeueCluster(pairIds), { kind: "requeued" });
  }

  // After deciding, collapse into a small confirmation (no full reload — lets the
  // admin blaze through the queue).
  if (done) {
    return (
      <div className="rounded-2xl border border-[#e6ecf2] bg-white p-4 text-sm text-[#8190a0]">
        {done.kind === "deferred" ? (
          "🤔 Apartado para revisar luego (en “Dudosos”)."
        ) : done.kind === "requeued" ? (
          "↩︎ Devuelto a la cola por revisar."
        ) : (
          <>
            <span className="font-semibold text-[#14212e]">{done.kept}</span>{" "}
            {done.merged > 0
              ? `→ se conservó; ${done.merged} duplicado(s) ocultado(s).`
              : "→ se conservó; el bloque se descartó (sin duplicados)."}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#e6ecf2] bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${tier.cls}`}>
          {tier.text}
        </span>
        <span className="text-xs font-medium text-[#5b6b7b]">
          {cluster.members.length} posibles repetidos
        </span>
        <span className="text-xs text-[#8190a0]">
          confianza {(cluster.confidence * 100).toFixed(0)}%
        </span>
        {cedulaSignal && (
          <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-700">
            cédula coincide
          </span>
        )}
      </div>

      <p className="mb-3 text-xs text-[#8190a0]">
        Elige cuál registro <strong>conservar</strong> y marca cuáles son la misma
        persona. Los marcados se ocultan; los demás se descartan.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cluster.members.map((m) => (
          <MemberCard
            key={m.id}
            side={m}
            isKeep={m.id === keepId}
            isDup={dupIds.has(m.id) && m.id !== keepId}
            onKeep={() => chooseKeep(m.id)}
            onToggleDup={() => toggleDup(m.id)}
            onZoom={(url) => setZoom(url)}
          />
        ))}
      </div>

      {/* Lightbox: one photo full-size. Click anywhere (or Esc) to close. */}
      {zoom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setZoom(null)}
          role="dialog"
          aria-modal="true"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={zoom}
            alt=""
            className="max-h-[85vh] max-w-full rounded-lg object-contain"
          />
          <button
            type="button"
            className="absolute right-4 top-4 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20"
            onClick={() => setZoom(null)}
          >
            ✗ Cerrar
          </button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 active:scale-[0.99] disabled:opacity-60"
        >
          {checkedDups.length > 0
            ? `✓ Conservar 1, ocultar ${checkedDups.length} duplicado(s)`
            : "✗ Descartar bloque (no son duplicados)"}
        </button>

        {deferred ? (
          // Already set aside: let the admin send it back to the main queue.
          <button
            type="button"
            disabled={pending}
            onClick={requeue}
            className="rounded-lg border border-[#e6ecf2] px-4 py-2 text-sm font-semibold text-[#14212e] transition hover:bg-slate-50 active:scale-[0.99] disabled:opacity-60"
          >
            ↩︎ Devolver a la cola
          </button>
        ) : (
          // "No estoy seguro": defer for a closer look later (nothing is hidden).
          <button
            type="button"
            disabled={pending}
            onClick={defer}
            className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-100 active:scale-[0.99] disabled:opacity-60"
            title="Apartar este bloque para revisarlo con más calma"
          >
            🤔 No estoy seguro
          </button>
        )}

        {checkedDups.length > 0 && (
          <span className="text-xs text-[#8190a0]">
            Se conservará <strong>{cluster.members.find((m) => m.id === keepId)?.name}</strong>
          </span>
        )}
      </div>

      {error && <p className="mt-2.5 text-sm font-medium text-red-600">{error}</p>}
    </div>
  );
}
