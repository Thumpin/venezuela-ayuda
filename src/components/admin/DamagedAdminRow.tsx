"use client";

import { useState } from "react";
import {
  verifyDamagedReport,
  updateDamagedReport,
  setHidden,
  deleteReport,
} from "@/app/admin/actions";
import { DAMAGE_SEVERITY, type DamageSeverity } from "@/lib/constants";
import { timeAgo } from "@/lib/format";
import type { AdminDamagedRow } from "@/lib/admin";

const SEVERITY_KEYS = Object.keys(DAMAGE_SEVERITY) as DamageSeverity[];

export default function DamagedAdminRow({ item }: { item: AdminDamagedRow }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    place_name: item.place_name,
    severity: item.severity as string,
    city: item.city ?? "",
    description: item.description ?? "",
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const sev = DAMAGE_SEVERITY[item.severity as DamageSeverity] ?? {
    label: item.severity,
    color: "#5b6b7b",
    tintBg: "#f0f3f7",
  };

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setPending(true);
    setError(null);
    try {
      const res = await fn();
      if (res.ok) {
        location.reload();
      } else {
        setError(res.error ?? "No se pudo completar la acción.");
        setPending(false);
      }
    } catch {
      setError("No se pudo completar la acción.");
      setPending(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-[#e6ecf2] px-3 py-2 text-sm outline-none focus:border-[#2563a8]";

  if (editing) {
    return (
      <div className="rounded-2xl border border-[#2563a8] bg-white p-4">
        <div className="space-y-2.5">
          <label className="block">
            <span className="text-xs font-medium text-[#8190a0]">Nombre del lugar</span>
            <input className={inputCls} value={form.place_name} onChange={(e) => set("place_name", e.target.value)} />
          </label>
          <div className="flex gap-2">
            <label className="block flex-1">
              <span className="text-xs font-medium text-[#8190a0]">Severidad</span>
              <select className={inputCls} value={form.severity} onChange={(e) => set("severity", e.target.value)}>
                {SEVERITY_KEYS.map((k) => (
                  <option key={k} value={k}>{DAMAGE_SEVERITY[k].label}</option>
                ))}
              </select>
            </label>
            <label className="block flex-1">
              <span className="text-xs font-medium text-[#8190a0]">Ciudad</span>
              <input className={inputCls} value={form.city} onChange={(e) => set("city", e.target.value)} />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-medium text-[#8190a0]">Descripción</span>
            <textarea className={inputCls} rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => updateDamagedReport(item.id, form))}
            style={{ backgroundColor: "#2563a8" }}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition active:scale-[0.99] disabled:opacity-60"
          >
            Guardar
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => { setEditing(false); setError(null); }}
            className="rounded-lg border border-[#e6ecf2] px-4 py-2 text-sm font-medium text-[#5b6b7b] transition hover:bg-slate-50"
          >
            Cancelar
          </button>
        </div>
        {error && <p className="mt-2.5 text-sm font-medium text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#e6ecf2] bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-base font-semibold text-[#14212e]">
          {item.place_name}
        </h3>
        <span
          className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold"
          style={{ backgroundColor: sev.tintBg, color: sev.color }}
        >
          {sev.label}
        </span>
      </div>

      <p className="mt-1 text-xs text-[#8190a0]">
        {item.city ? `${item.city} · ` : ""}
        {timeAgo(item.created_at)}
        {` · ${item.source ? `Fuente: ${item.source}` : "Desde el sitio"}`}
      </p>

      {item.description && (
        <p className="mt-2 line-clamp-2 break-words text-sm text-[#5b6b7b]">
          {item.description}
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {item.verified_at ? (
          <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
            ✅ Verificado
          </span>
        ) : (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
            ⏳ Sin verificar
          </span>
        )}
        {item.risk_level && (
          <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">
            Riesgo: {item.risk_level}
          </span>
        )}
        {item.status && item.status !== "OPEN" && (
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
            {item.status}
          </span>
        )}
        {item.hidden && (
          <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
            Oculto
          </span>
        )}
      </div>

      <div className="mt-3.5 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => verifyDamagedReport(item.id, !item.verified_at))}
          className="rounded-lg border border-[#e6ecf2] px-3 py-2 text-sm font-medium text-[#14212e] transition hover:bg-slate-50 active:scale-[0.99] disabled:opacity-60"
        >
          {item.verified_at ? "Quitar verificación" : "Verificar"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setEditing(true)}
          className="rounded-lg border border-[#e6ecf2] px-3 py-2 text-sm font-medium text-[#14212e] transition hover:bg-slate-50 active:scale-[0.99] disabled:opacity-60"
        >
          Editar
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => setHidden("damaged_reports", item.id, !item.hidden))}
          className="rounded-lg border border-[#e6ecf2] px-3 py-2 text-sm font-medium text-[#14212e] transition hover:bg-slate-50 active:scale-[0.99] disabled:opacity-60"
        >
          {item.hidden ? "Mostrar" : "Ocultar"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!window.confirm("¿Eliminar este reporte definitivamente?")) return;
            run(() => deleteReport("damaged_reports", item.id));
          }}
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 active:scale-[0.99] disabled:opacity-60"
        >
          Eliminar
        </button>
      </div>

      {error && <p className="mt-2.5 text-sm font-medium text-red-600">{error}</p>}
    </div>
  );
}
