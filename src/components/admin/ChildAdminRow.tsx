"use client";

import { useState } from "react";
import { addChildCustodyEvent, setChildHidden } from "@/app/admin/actions";
import {
  CHILD_STATUSES,
  CHILD_GENDERS,
  CHILD_INFO_SOURCES,
  type ChildStatus,
  type ChildGender,
  type ChildInfoSource,
} from "@/lib/constants";
import { fullDate, timeAgo } from "@/lib/format";
import type { AdminChildRow, AdminCustodyEventRow } from "@/lib/admin";

const STATUS_KEYS = Object.keys(CHILD_STATUSES) as ChildStatus[];

const statusLabel = (s: string | null) =>
  s ? (CHILD_STATUSES[s as ChildStatus]?.label ?? s) : null;

export default function ChildAdminRow({
  child,
  events,
}: {
  child: AdminChildRow;
  events: AdminCustodyEventRow[];
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [ev, setEv] = useState({
    status: "",
    placement: "",
    facility_name: "",
    custodian: "",
    event_date: "",
    note: "",
  });
  const set = (k: keyof typeof ev, v: string) => setEv((p) => ({ ...p, [k]: v }));

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

  function submitEvent() {
    const fd = new FormData();
    fd.set("child_id", child.id);
    fd.set("status", ev.status);
    fd.set("placement", ev.placement);
    fd.set("facility_name", ev.facility_name);
    fd.set("custodian", ev.custodian);
    fd.set("event_date", ev.event_date);
    fd.set("note", ev.note);
    run(() => addChildCustodyEvent({ ok: false }, fd));
  }

  const inputCls =
    "w-full rounded-lg border border-[#e6ecf2] px-3 py-2 text-sm outline-none focus:border-[#2563a8]";

  return (
    <div className="rounded-2xl border border-[#e6ecf2] bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-base font-semibold text-[#14212e]">
          👶 {child.name}
        </h3>
        {statusLabel(child.status) && (
          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
            {statusLabel(child.status)}
          </span>
        )}
        {child.hidden && (
          <span className="shrink-0 rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
            Oculto
          </span>
        )}
      </div>

      <p className="mt-1 text-xs text-[#8190a0]">
        Registrado {timeAgo(child.created_at)}
        {child.last_custody_at
          ? ` · Última actualización ${timeAgo(child.last_custody_at)}`
          : " · Sin actualización de paradero"}
      </p>

      {/* Ficha completa (PII) — solo visible acá (super admin) */}
      <details className="mt-2">
        <summary className="cursor-pointer text-sm font-medium text-[#2563a8]">
          Ver ficha completa
        </summary>
        <div className="mt-2 space-y-1.5 text-sm text-slate-700">
          <Field label="Edad" value={child.age} />
          <Field
            label="Género"
            value={child.gender ? CHILD_GENDERS[child.gender as ChildGender]?.label : null}
          />
          <Field label="Descripción física" value={child.description} />
          <Field label="Lugar donde fue encontrado" value={child.found_place} />
          <Field label="Fecha donde fue encontrado" value={child.found_at ? fullDate(child.found_at) : null} />
          <Field label="Última vez visto" value={child.last_seen_at ? fullDate(child.last_seen_at) : null} />
          <Field label="Hospital / centro de salud" value={child.hospital} />
          <Field label="Último lugar donde lo vieron" value={child.last_seen_place} />
          <Field
            label="Fuente de la información"
            value={
              child.info_source
                ? [CHILD_INFO_SOURCES[child.info_source as ChildInfoSource]?.label, child.info_source_detail]
                    .filter(Boolean)
                    .join(" · ")
                : child.info_source_detail
            }
          />
          <Field label="Contacto directo" value={child.direct_contact == null ? null : child.direct_contact ? "Sí" : "No (de otra fuente)"} />
          <Field label="Notas" value={child.notes} />
          <Field label="Reportado por" value={child.reporter_name} />
          {child.photo_url && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={child.photo_url}
              alt={child.name}
              className="mt-1 max-h-64 w-full rounded-lg object-cover ring-1 ring-slate-200"
            />
          )}
        </div>
      </details>

      {/* Historial de paradero y custodia */}
      <div className="mt-3 border-t border-slate-100 pt-3">
        <p className="text-sm font-semibold text-[#14212e]">Historial de paradero y custodia</p>
        {events.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">Sin actualizaciones todavía.</p>
        ) : (
          <ol className="mt-2 space-y-2 border-l-2 border-slate-200 pl-4">
            {events.map((e) => (
              <li key={e.seq} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-[#2563a8]" />
                {statusLabel(e.status) && (
                  <p className="text-sm font-semibold text-slate-800">{statusLabel(e.status)}</p>
                )}
                {(e.placement || e.facility_name) && (
                  <p className="text-sm text-slate-600">
                    🏥 {[e.placement, e.facility_name].filter(Boolean).join(" · ")}
                  </p>
                )}
                {e.custodian && <p className="text-sm text-slate-600">👤 {e.custodian}</p>}
                {e.note && <p className="text-sm text-slate-600">{e.note}</p>}
                <p className="text-xs text-slate-400">
                  {fullDate(e.event_date ?? e.occurred_at)}
                  {e.recorded_by ? ` · ${e.recorded_by}` : ""}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Agregar evento de custodia */}
      {adding ? (
        <div className="mt-3 space-y-2.5 rounded-xl border border-[#2563a8] p-3">
          <label className="block">
            <span className="text-xs font-medium text-[#8190a0]">Situación</span>
            <select className={inputCls} value={ev.status} onChange={(e) => set("status", e.target.value)}>
              <option value="">—</option>
              {STATUS_KEYS.map((k) => (
                <option key={k} value={k}>{CHILD_STATUSES[k].label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-[#8190a0]">Tipo de lugar (hospital, refugio, familia temporal, autoridad)</span>
            <input className={inputCls} value={ev.placement} onChange={(e) => set("placement", e.target.value)} />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-[#8190a0]">Nombre del lugar / institución</span>
            <input className={inputCls} value={ev.facility_name} onChange={(e) => set("facility_name", e.target.value)} />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-[#8190a0]">Con quién está</span>
            <input className={inputCls} value={ev.custodian} onChange={(e) => set("custodian", e.target.value)} />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-[#8190a0]">Fecha del evento</span>
            <input type="date" className={inputCls} value={ev.event_date} onChange={(e) => set("event_date", e.target.value)} />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-[#8190a0]">Nota</span>
            <textarea className={inputCls} rows={2} value={ev.note} onChange={(e) => set("note", e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={submitEvent}
              style={{ backgroundColor: "#2563a8" }}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition active:scale-[0.99] disabled:opacity-60"
            >
              Guardar evento
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => { setAdding(false); setError(null); }}
              className="rounded-lg border border-[#e6ecf2] px-4 py-2 text-sm font-medium text-[#5b6b7b] transition hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => setAdding(true)}
            className="rounded-lg border border-[#e6ecf2] px-3 py-2 text-sm font-medium text-[#14212e] transition hover:bg-slate-50 active:scale-[0.99] disabled:opacity-60"
          >
            Actualizar paradero
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => setChildHidden(child.id, !child.hidden))}
            className="rounded-lg border border-[#e6ecf2] px-3 py-2 text-sm font-medium text-[#14212e] transition hover:bg-slate-50 active:scale-[0.99] disabled:opacity-60"
          >
            {child.hidden ? "Mostrar" : "Ocultar"}
          </button>
        </div>
      )}

      {error && <p className="mt-2.5 text-sm font-medium text-red-600">{error}</p>}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <p>
      <span className="font-semibold text-slate-900">{label}:</span>{" "}
      <span className="whitespace-pre-wrap">{value}</span>
    </p>
  );
}
