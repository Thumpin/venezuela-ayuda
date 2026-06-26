"use client";

import { useEffect, useState } from "react";
import { decideMerge } from "@/app/admin/actions";
import { timeAgo } from "@/lib/format";
import type { MergeCandidate, MergeSide } from "@/lib/admin";

const TIER_LABEL: Record<MergeCandidate["tier"], { text: string; cls: string }> = {
  HARD: { text: "Casi seguro", cls: "bg-emerald-100 text-emerald-700" },
  STRONG: { text: "Muy probable", cls: "bg-amber-100 text-amber-700" },
  REVIEW: { text: "Revisar", cls: "bg-slate-200 text-slate-600" },
};

// One person's card, shown on one side of the comparison.
function Side({
  side,
  tag,
  onZoom,
}: {
  side: MergeSide;
  tag: string;
  onZoom: (url: string) => void;
}) {
  return (
    <div className="min-w-0 flex-1 rounded-xl border border-[#e6ecf2] bg-slate-50 p-3">
      <div className="flex items-center gap-2">
        <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#8190a0]">
          {tag}
        </span>
        <h4 className="min-w-0 truncate text-sm font-semibold text-[#14212e]">{side.name}</h4>
      </div>
      {side.photo_url ? (
        // The photo is the most important signal for a human deciding whether two
        // records are the same person. Show it WHOLE (object-contain, never
        // cropped), large, on a dark backdrop so faces are easy to compare — and
        // click to open it full-size in a lightbox.
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
            className="h-64 w-full object-contain"
            loading="lazy"
          />
          <span className="pointer-events-none absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white opacity-0 transition group-hover:opacity-100">
            🔍 Ampliar
          </span>
        </button>
      ) : (
        <div className="mt-2 flex h-64 w-full items-center justify-center rounded-lg bg-slate-100 text-xs text-[#8190a0]">
          Sin foto
        </div>
      )}
      <dl className="mt-2 space-y-1 text-xs text-[#5b6b7b]">
        <Field k="Zona" v={side.place_name || side.city || "—"} />
        {side.message && <Field k="Descripción" v={side.message} />}
        <Field k="Teléfono" v={side.has_phone ? "sí (privado)" : "no"} />
        <Field k="Fuente" v={side.source || "—"} />
        <Field k="Reportado" v={timeAgo(side.created_at)} />
      </dl>
    </div>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-1.5">
      <dt className="shrink-0 font-medium text-[#8190a0]">{k}:</dt>
      <dd className="min-w-0 break-words">{v}</dd>
    </div>
  );
}

export default function MergeCandidateRow({ item }: { item: MergeCandidate }) {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<"duplicate" | "not" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
  const tier = TIER_LABEL[item.tier];

  // Esc closes the lightbox — fast keyboard flow while reviewing many pairs.
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoom(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  async function decide(decision: "duplicate" | "not") {
    setPending(true);
    setError(null);
    try {
      const res = await decideMerge(item.id, decision);
      if (res.ok) setDone(decision);
      else {
        setError(res.error ?? "No se pudo guardar.");
        setPending(false);
      }
    } catch {
      setError("No se pudo guardar.");
      setPending(false);
    }
  }

  // After deciding, collapse into a small confirmation (no full reload — lets the
  // admin blaze through the list).
  if (done) {
    return (
      <div className="rounded-2xl border border-[#e6ecf2] bg-white p-4 text-sm text-[#8190a0]">
        <span className="font-semibold text-[#14212e]">{item.keep.name}</span>{" "}
        {done === "duplicate" ? "→ marcado como duplicado (el otro se ocultó)." : "→ marcado como NO duplicado."}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#e6ecf2] bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${tier.cls}`}>
          {tier.text}
        </span>
        <span className="text-xs text-[#8190a0]">
          confianza {(item.confidence * 100).toFixed(0)}%
        </span>
        {item.evidence?.cosine != null && (
          <span className="text-xs text-[#8190a0]">· similitud IA {item.evidence.cosine as number}</span>
        )}
        {item.evidence?.phone_match ? (
          <span className="text-xs text-[#8190a0]">· mismo teléfono</span>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Side side={item.keep} tag="A" onZoom={() => setZoom(true)} />
        <Side side={item.dup} tag="B" onZoom={() => setZoom(true)} />
      </div>

      {/* Lightbox: both photos side by side at full size — the clearest way to
          compare two faces. Click anywhere (or Esc) to close. */}
      {zoom && (item.keep.photo_url || item.dup.photo_url) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center gap-4 bg-black/90 p-4"
          onClick={() => setZoom(false)}
          role="dialog"
          aria-modal="true"
        >
          {[item.keep, item.dup].map((s, i) => (
            <figure key={i} className="flex max-h-full min-w-0 flex-1 flex-col items-center">
              <figcaption className="mb-2 text-sm font-semibold text-white">
                {i === 0 ? "A" : "B"} · {s.name}
              </figcaption>
              {s.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={s.photo_url}
                  alt={s.name}
                  className="max-h-[80vh] max-w-full rounded-lg object-contain"
                />
              ) : (
                <div className="flex h-40 w-full items-center justify-center rounded-lg bg-slate-800 text-sm text-slate-400">
                  Sin foto
                </div>
              )}
            </figure>
          ))}
          <button
            type="button"
            className="absolute right-4 top-4 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20"
            onClick={() => setZoom(false)}
          >
            ✗ Cerrar
          </button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => decide("duplicate")}
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 active:scale-[0.99] disabled:opacity-60"
        >
          ✓ Son la misma persona (duplicado)
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => decide("not")}
          className="rounded-lg border border-[#e6ecf2] px-4 py-2 text-sm font-semibold text-[#14212e] transition hover:bg-slate-50 active:scale-[0.99] disabled:opacity-60"
        >
          ✗ Son personas distintas
        </button>
      </div>

      {error && <p className="mt-2.5 text-sm font-medium text-red-600">{error}</p>}
    </div>
  );
}
