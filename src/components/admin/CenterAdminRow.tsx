"use client";

import { useState } from "react";
import {
  verifyCenter,
  setCenterHidden,
  deleteCenter,
  updateCenter,
} from "@/app/admin/actions";
import { timeAgo } from "@/lib/format";
import type { AdminCenterRow } from "@/lib/admin";

type Result = { ok: boolean; error?: string };

const inputCls =
  "w-full rounded-lg border border-[#e6ecf2] px-3 py-2 text-sm text-[#14212e] outline-none focus:border-[#2563a8]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[#5b6b7b]">{label}</span>
      {children}
    </label>
  );
}

export default function CenterAdminRow({ item }: { item: AdminCenterRow }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: item.name,
    country: item.country,
    state: item.state ?? "",
    city: item.city ?? "",
    address: item.address ?? "",
    resources: item.resources ?? "",
    organizers: item.organizers ?? "",
    contact: item.contact ?? "",
    website: item.website ?? "",
    can_ship_to_venezuela:
      item.can_ship_to_venezuela === true ? "si" : item.can_ship_to_venezuela === false ? "no" : "",
    volunteers_count: item.volunteers_count?.toString() ?? "",
    needs_volunteers: item.needs_volunteers ?? false,
  });
  const set = (k: keyof typeof form, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function run(fn: () => Promise<Result>) {
    setPending(true);
    setError(null);
    try {
      const res = await fn();
      if (res.ok) location.reload();
      else {
        setError(res.error ?? "No se pudo completar la acción.");
        setPending(false);
      }
    } catch {
      setError("No se pudo completar la acción.");
      setPending(false);
    }
  }

  function save() {
    run(() =>
      updateCenter(item.id, {
        name: form.name,
        country: form.country,
        state: form.state,
        city: form.city,
        address: form.address,
        resources: form.resources,
        organizers: form.organizers,
        contact: form.contact,
        website: form.website,
        can_ship_to_venezuela:
          form.can_ship_to_venezuela === "si"
            ? true
            : form.can_ship_to_venezuela === "no"
              ? false
              : null,
        volunteers_count: form.volunteers_count,
        needs_volunteers: form.needs_volunteers,
      }),
    );
  }

  const place = [item.city, item.state, item.country].filter(Boolean).join(" · ");
  const ship =
    item.can_ship_to_venezuela === true
      ? "Sí"
      : item.can_ship_to_venezuela === false
        ? "No"
        : "No indica";

  return (
    <div
      className={`rounded-2xl border bg-white p-4 ${
        item.verified ? "border-[#e6ecf2]" : "border-[#f0d9a8]"
      }`}
    >
      {editing ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre">
              <input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="País (exacto: 'Venezuela' → mapa)">
              <input className={inputCls} value={form.country} onChange={(e) => set("country", e.target.value)} />
            </Field>
            <Field label="Estado">
              <input className={inputCls} value={form.state} onChange={(e) => set("state", e.target.value)} />
            </Field>
            <Field label="Ciudad">
              <input className={inputCls} value={form.city} onChange={(e) => set("city", e.target.value)} />
            </Field>
          </div>
          <Field label="Dirección">
            <input className={inputCls} value={form.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <Field label="Recursos que reciben">
            <textarea
              className={`${inputCls} min-h-[60px]`}
              value={form.resources}
              onChange={(e) => set("resources", e.target.value)}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Organizadores">
              <input className={inputCls} value={form.organizers} onChange={(e) => set("organizers", e.target.value)} />
            </Field>
            <Field label="Contacto (público)">
              <input className={inputCls} value={form.contact} onChange={(e) => set("contact", e.target.value)} />
            </Field>
            <Field label="Sitio web">
              <input className={inputCls} value={form.website} onChange={(e) => set("website", e.target.value)} />
            </Field>
            <Field label="¿Envía a Venezuela?">
              <select
                className={inputCls}
                value={form.can_ship_to_venezuela}
                onChange={(e) => set("can_ship_to_venezuela", e.target.value)}
              >
                <option value="">No indica</option>
                <option value="si">Sí</option>
                <option value="no">No</option>
              </select>
            </Field>
            <Field label="N.º de voluntarios">
              <input
                type="number"
                min={0}
                className={inputCls}
                value={form.volunteers_count}
                onChange={(e) => set("volunteers_count", e.target.value)}
              />
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium text-[#14212e]">
              <input
                type="checkbox"
                checked={form.needs_volunteers}
                onChange={(e) => set("needs_volunteers", e.target.checked)}
              />
              Necesita más voluntarios
            </label>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              disabled={pending}
              onClick={save}
              className="rounded-lg bg-[#2563a8] px-4 py-2 text-sm font-semibold text-white transition active:scale-[0.99] disabled:opacity-60"
            >
              Guardar
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
              className="rounded-lg border border-[#e6ecf2] px-4 py-2 text-sm font-medium text-[#5b6b7b] transition hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
          {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 flex-1 truncate text-base font-semibold text-[#14212e]">
              {item.name}
            </h3>
            {item.country === "Venezuela" && (
              <span className="shrink-0 rounded-full bg-[#eef9f2] px-2.5 py-1 text-xs font-semibold text-[#1f7a52]">
                🇻🇪 mapa
              </span>
            )}
          </div>

          <p className="mt-1 text-xs text-[#8190a0]">
            {place ? `${place} · ` : ""}
            {item.source === "user" ? "postulado" : "semilla"} · {timeAgo(item.created_at)}
          </p>

          {item.address && <p className="mt-1.5 text-sm text-[#5b6b7b]">📍 {item.address}</p>}
          {item.resources && (
            <p className="mt-1.5 text-sm text-[#5b6b7b]">
              <span className="font-medium text-[#14212e]">Reciben:</span> {item.resources}
            </p>
          )}

          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-[#5b6b7b]">
            {item.organizers && (
              <div className="col-span-2">
                <span className="font-medium text-[#14212e]">Organizadores:</span> {item.organizers}
              </div>
            )}
            {item.contact && (
              <div>
                <span className="font-medium text-[#14212e]">Contacto:</span> {item.contact}
              </div>
            )}
            {item.website && (
              <div className="truncate">
                <span className="font-medium text-[#14212e]">Web:</span> {item.website}
              </div>
            )}
            <div>
              <span className="font-medium text-[#14212e]">¿Envía a Venezuela?</span> {ship}
            </div>
            <div>
              <span className="font-medium text-[#14212e]">Voluntarios:</span>{" "}
              {item.volunteers_count ?? "—"}
              {item.needs_volunteers ? " · necesita más" : ""}
            </div>
          </dl>

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {!item.verified && (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                ⏳ Pendiente
              </span>
            )}
            {item.verified && (
              <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                ✅ Verificado
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
              onClick={() => run(() => verifyCenter(item.id, !item.verified))}
              className="rounded-lg border border-[#e6ecf2] px-3 py-2 text-sm font-medium text-[#14212e] transition hover:bg-slate-50 active:scale-[0.99] disabled:opacity-60"
            >
              {item.verified ? "Quitar verificación" : "Aprobar / Verificar"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setEditing(true);
                setError(null);
              }}
              className="rounded-lg border border-[#e6ecf2] px-3 py-2 text-sm font-medium text-[#14212e] transition hover:bg-slate-50 active:scale-[0.99] disabled:opacity-60"
            >
              Editar
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => setCenterHidden(item.id, !item.hidden))}
              className="rounded-lg border border-[#e6ecf2] px-3 py-2 text-sm font-medium text-[#14212e] transition hover:bg-slate-50 active:scale-[0.99] disabled:opacity-60"
            >
              {item.hidden ? "Mostrar" : "Ocultar"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!window.confirm("¿Eliminar este centro definitivamente?")) return;
                run(() => deleteCenter(item.id));
              }}
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 active:scale-[0.99] disabled:opacity-60"
            >
              Eliminar
            </button>
          </div>

          {error && <p className="mt-2.5 text-sm font-medium text-red-600">{error}</p>}
        </>
      )}
    </div>
  );
}
