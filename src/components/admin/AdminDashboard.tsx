"use client";

import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useCallback, useMemo } from "react";
import { timeAgo } from "@/lib/format";
import type { MergeCandidate, ReviewedCandidate, AdminDamagedRow, ModerationItem } from "@/lib/admin";

const TIER_BADGE: Record<string, { text: string; cls: string }> = {
  HARD: { text: "Casi seguro", cls: "bg-emerald-100 text-emerald-700" },
  STRONG: { text: "Muy probable", cls: "bg-amber-100 text-amber-700" },
  REVIEW: { text: "Revisar", cls: "bg-slate-200 text-slate-600" },
};

function SelectableRow({ id, type, label, subtitle, badge, children, selected }: {
  id: string; type: string; label: string; subtitle?: string; badge?: { text: string; cls: string }; children?: React.ReactNode; selected: boolean;
}) {
  const router = useRouter();
  const sel = `${type}:${id}`;
  const onClick = () => {
    const p = new URLSearchParams(window.location.search);
    const cur = p.get("sel");
    p.set("sel", cur === sel ? "" : sel);
    router.replace(`/admin?${p.toString()}`, { scroll: false });
  };

  return (
    <button type="button" onClick={onClick}
      className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
        selected
          ? "border-[#14212e] bg-[#14212e]/5 shadow-sm"
          : "border-[#e6ecf2] bg-white hover:border-[#8190a0] hover:shadow-sm"
      }`}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[#14212e]">{label}</p>
          {subtitle && <p className="truncate text-xs text-[#8190a0]">{subtitle}</p>}
        </div>
        {badge && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}>{badge.text}</span>}
      </div>
      {children}
    </button>
  );
}

function DetailPanel({ sel, pending, damaged, mod }: {
  sel: string; pending: MergeCandidate[]; damaged: AdminDamagedRow[]; mod: ModerationItem[];
}) {
  const [type, id] = sel.split(":");

  if (type === "dup") {
    const c = pending.find((x) => x.id === id);
    if (!c) return <EmptyDetail />;
    const tier = TIER_BADGE[c.tier];
    return (
      <div className="rounded-2xl border border-[#e6ecf2] bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${tier.cls}`}>{tier.text}</span>
          <span className="text-sm font-semibold text-[#14212e]">{(c.confidence * 100).toFixed(0)}% confianza</span>
        </div>
        <div className="mb-4 rounded-xl bg-amber-50 p-3 text-sm">
          <span className="font-medium text-amber-800">Razón: </span>
          <span className="text-amber-700">{c.reason}</span>
        </div>
        {/* Side-by-side */}
        <div className="flex flex-col gap-4 sm:flex-row">
          {[c.keep, c.dup].map((s, i) => (
            <div key={i} className="min-w-0 flex-1 rounded-xl border border-[#e6ecf2] bg-slate-50 p-3">
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-[#8190a0]">{i === 0 ? "A — Conservar" : "B — Duplicado"}</h4>
              <p className="text-sm font-semibold text-[#14212e]">{s.name}</p>
              {s.photo_url && <img src={s.photo_url} alt="" className="mt-2 h-28 w-full rounded-lg object-cover" />}
              <dl className="mt-2 space-y-1 text-xs text-[#5b6b7b]">
                <div className="flex justify-between"><dt>Zona:</dt><dd>{s.city || s.place_name || "—"}</dd></div>
                <div className="flex justify-between"><dt>Fuente:</dt><dd>{s.source || "—"}</dd></div>
                <div className="flex justify-between"><dt>Reportado:</dt><dd>{timeAgo(s.created_at)}</dd></div>
              </dl>
              {s.message && <p className="mt-2 rounded-lg bg-white p-2 text-xs text-[#5b6b7b]">{s.message}</p>}
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <Link href={`/admin/duplicados?focus=${c.id}`}
            className="w-full rounded-lg bg-[#14212e] px-3 py-2 text-center text-sm font-medium text-white transition hover:bg-[#14212e]/90">
            Decidir
          </Link>
        </div>
      </div>
    );
  }

  if (type === "damaged") {
    const d = damaged.find((x) => x.id === id);
    if (!d) return <EmptyDetail />;
    return (
      <div className="rounded-2xl border border-[#e6ecf2] bg-white p-5">
        <h3 className="text-lg font-bold text-[#14212e]">{d.place_name}</h3>
        <p className="mt-1 text-xs text-[#8190a0]">{d.city ? `${d.city} · ` : ""}{timeAgo(d.created_at)}</p>
        {d.description && <p className="mt-3 text-sm text-[#5b6b7b]">{d.description}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          {d.verified_at && <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">✅ Verificado</span>}
          {d.hidden && <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-600">Oculto</span>}
        </div>
      </div>
    );
  }

  if (type === "mod") {
    const m = mod.find((x) => x.table + x.id === id);
    if (!m) return <EmptyDetail />;
    return (
      <div className="rounded-2xl border border-[#e6ecf2] bg-white p-5">
        <h3 className="text-lg font-bold text-[#14212e]">{m.label}</h3>
        <p className="mt-1 text-xs text-[#8190a0]">{m.sub ? `${m.sub} · ` : ""}{timeAgo(m.created_at)}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {m.hidden && <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-600">Oculto</span>}
        </div>
        <p className="mt-3 text-xs text-[#8190a0]">Tabla: {m.table}</p>
      </div>
    );
  }

  return <EmptyDetail />;
}

function EmptyDetail() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#e6ecf2] bg-white p-8 text-center">
      <span className="text-2xl text-[#8190a0]">👆</span>
      <p className="mt-3 text-sm font-medium text-[#8190a0]">Selecciona un elemento</p>
      <p className="mt-1 text-xs text-[#8190a0]">Haz clic en cualquier fila para ver los detalles aquí.</p>
    </div>
  );
}

export default function AdminDashboard({ pending, reviewed, damaged, mod }: {
  pending: MergeCandidate[]; reviewed: ReviewedCandidate[]; damaged: AdminDamagedRow[]; mod: ModerationItem[];
}) {
  const sp = useSearchParams();
  const sel = sp.get("sel") || "";

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Left column: lists */}
      <div className="space-y-6 lg:col-span-1">
        {/* Duplicados */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-[#14212e]">
              <span className="text-base">🔁</span> Duplicados
            </h2>
            <span className="text-xs text-[#8190a0]">{pending.length} pendientes</span>
          </div>
          <div className="space-y-1.5">
            {pending.length === 0 ? (
              <p className="rounded-xl border border-[#e6ecf2] bg-white px-3 py-4 text-xs text-[#8190a0]">Sin pendientes.</p>
            ) : (
              pending.slice(0, 6).map((c) => {
                const tier = TIER_BADGE[c.tier];
                return (
                  <SelectableRow key={c.id} id={c.id} type="dup"
                    label={`${c.keep.name} vs ${c.dup.name}`}
                    subtitle={`${c.keep.city || c.keep.place_name || "—"} · ${(c.confidence * 100).toFixed(0)}%`}
                    badge={tier}
                    selected={sel === `dup:${c.id}`} />
                );
              })
            )}
          </div>
          <div className="mt-2 flex gap-2 text-xs">
            <Link href="/admin/duplicados" className="font-medium text-[#8190a0] transition hover:text-[#14212e]">Ver todos</Link>
            <Link href="/admin/duplicados/revisados" className="font-medium text-[#8190a0] transition hover:text-[#14212e]">Historial ({reviewed.length})</Link>
          </div>
        </section>

        {/* Edificios dañados */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-[#14212e]">
              <span className="text-base">🏚️</span> Edificios
            </h2>
            <span className="text-xs text-[#8190a0]">{damaged.length} reportes</span>
          </div>
          <div className="space-y-1.5">
            {damaged.length === 0 ? (
              <p className="rounded-xl border border-[#e6ecf2] bg-white px-3 py-4 text-xs text-[#8190a0]">Sin reportes.</p>
            ) : (
              damaged.slice(0, 6).map((d) => (
                <SelectableRow key={d.id} id={d.id} type="damaged"
                  label={d.place_name}
                  subtitle={`${d.city || ""} · ${timeAgo(d.created_at)}`}
                  selected={sel === `damaged:${d.id}`} />
              ))
            )}
          </div>
        </section>

        {/* Moderación */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-[#14212e]">
              <span className="text-base">⚡</span> Moderación
            </h2>
            <span className="text-xs text-[#8190a0]">{mod.length} pendientes</span>
          </div>
          <div className="space-y-1.5">
            {mod.length === 0 ? (
              <p className="rounded-xl border border-[#e6ecf2] bg-white px-3 py-4 text-xs text-[#8190a0]">Sin pendientes.</p>
            ) : (
              mod.slice(0, 5).map((m) => (
                <SelectableRow key={m.table + m.id} id={m.table + m.id} type="mod"
                  label={m.label}
                  subtitle={`${m.sub || ""} · ${timeAgo(m.created_at)}`}
                  selected={sel === `mod:${m.table + m.id}`} />
              ))
            )}
          </div>
        </section>

        {/* Admin link */}
        <Link href="/admin/admins"
          className="flex items-center gap-2 rounded-xl border border-[#e6ecf2] bg-white px-3 py-2.5 text-sm font-medium text-[#14212e] transition hover:border-[#8190a0] hover:shadow-sm">
          <span className="text-base">👤</span> Gestionar administradores →
        </Link>
      </div>

      {/* Right column: detail */}
      <div className="lg:col-span-2">
        <DetailPanel sel={sel} pending={pending} damaged={damaged} mod={mod} />
      </div>
    </div>
  );
}
