"use client";

import { useState } from "react";
import { setHidden, deleteReport, getReportDetails, updateCheckinReport } from "@/app/admin/actions";
import { timeAgo } from "@/lib/format";
import type { ModerationItem } from "@/lib/admin";

export default function ModerationRow({
  item,
  hospitalName,
}: {
  item: ModerationItem;
  hospitalName?: string | null;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit states
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"SAFE" | "NEEDS_HELP" | "LOOKING_FOR_SOMEONE" | "DIFUNTO" | "HOSPITALIZADO">("LOOKING_FOR_SOMEONE");
  const [city, setCity] = useState("");
  const [message, setMessage] = useState("");
  const [phonePrivate, setPhonePrivate] = useState("");

  // Photo modal
  const [showPhoto, setShowPhoto] = useState(false);

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

  async function startEditing() {
    setPending(true);
    setError(null);
    try {
      const res = await getReportDetails(item.table, item.id);
      if (res.ok && res.data) {
        setName(res.data.name || "");
        setStatus(res.data.status || "LOOKING_FOR_SOMEONE");
        setCity(res.data.city || "");
        setMessage(res.data.message || "");
        setPhonePrivate(res.data.phone_private || "");
        setIsEditing(true);
      } else {
        setError(res.error ?? "No se pudieron cargar los detalles.");
      }
    } catch {
      setError("Error al cargar los detalles.");
    } finally {
      setPending(false);
    }
  }

  async function handleSave() {
    setPending(true);
    setError(null);
    try {
      const res = await updateCheckinReport(item.id, {
        name,
        status,
        city,
        message,
        phone_private: phonePrivate,
      });
      if (res.ok) {
        setIsEditing(false);
        location.reload();
      } else {
        setError(res.error ?? "No se pudo actualizar.");
      }
    } catch {
      setError("Ocurrió un error al guardar.");
    } finally {
      setPending(false);
    }
  }

  if (isEditing) {
    return (
      <div className="rounded-2xl border border-[#e6ecf2] bg-white p-5 flex flex-col gap-4 shadow-md transition-all duration-200">
        <h4 className="font-bold text-[#14212e]">✏️ Completar Detalles del Reporte</h4>
        
        {error && <p className="text-xs font-semibold text-red-600 bg-red-50 p-2 rounded-md border border-red-100">{error}</p>}
        
        <div className="grid gap-3 sm:grid-cols-2 text-sm">
          <div>
            <label className="block text-xs font-semibold text-[#5b6b7b] mb-1">Nombre Completo</label>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-slate-50 focus:bg-white transition"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Carlos Eduardo Mendoza"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#5b6b7b] mb-1">Estado de Localización</label>
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-slate-50 focus:bg-white transition"
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
            >
              <option value="LOOKING_FOR_SOMEONE">Desaparecido / Buscando a alguien</option>
              <option value="SAFE">A Salvo (Encontrado/a)</option>
              <option value="NEEDS_HELP">Necesita Ayuda Urgente</option>
              <option value="DIFUNTO">⚫ Difunto</option>
              <option value="HOSPITALIZADO">🏥 Hospitalizado</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#5b6b7b] mb-1">Ciudad / Ubicación</label>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-slate-50 focus:bg-white transition"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Ej: Caracas"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#5b6b7b] mb-1">Teléfono (Contacto Privado)</label>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-slate-50 focus:bg-white transition"
              value={phonePrivate}
              onChange={(e) => setPhonePrivate(e.target.value)}
              placeholder="Ej: +58 412-5555555"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-[#5b6b7b] mb-1">Mensaje / Notas Adicionales</label>
            <textarea
              className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-slate-50 focus:bg-white transition min-h-[60px]"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Información adicional del reporte..."
            />
          </div>
        </div>
        
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 mt-1">
          <button
            type="button"
            disabled={pending}
            onClick={() => setIsEditing(false)}
            className="rounded-lg border border-[#e6ecf2] px-4 py-2 text-sm font-medium text-[#14212e] hover:bg-slate-50 transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={handleSave}
            className="rounded-lg bg-[#2563a8] text-white px-4 py-2 text-sm font-semibold shadow hover:bg-[#1a4a82] transition disabled:opacity-50"
          >
            {pending ? "Guardando..." : "Guardar Cambios"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="rounded-2xl border border-[#e6ecf2] bg-white p-4 flex flex-col gap-2 shadow-sm">
      <div className="flex flex-wrap items-start gap-3">
        {item.photo_url && (
          <button
            type="button"
            onClick={() => setShowPhoto(true)}
            className="shrink-0 overflow-hidden rounded-xl border border-slate-100 shadow-sm focus:outline-none group"
            title="Ver foto completa"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.photo_url}
              alt={item.label}
              className="h-14 w-14 object-cover transition-transform duration-200 group-hover:scale-110"
            />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 truncate text-base font-semibold text-[#14212e]">
              {item.label}
            </h3>
            {hospitalName && (
              <span className="rounded-md border border-red-100 bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700 flex items-center gap-1 shadow-sm">
                <span className="text-xs">✚</span> {hospitalName}
              </span>
            )}
            {item.hidden && (
              <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                Oculto
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-[#8190a0]">
            {item.sub ? `${item.sub} · ` : ""}
            {timeAgo(item.created_at)}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {item.table === "checkins" && (
            <button
              type="button"
              disabled={pending}
              onClick={startEditing}
              className="rounded-lg border border-[#e6ecf2] px-3 py-2 text-sm font-medium text-[#2563a8] bg-[#2563a8]/5 hover:bg-[#2563a8]/10 transition active:scale-[0.99] disabled:opacity-60"
            >
              Completar Detalles
            </button>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => setHidden(item.table, item.id, !item.hidden))}
            className="rounded-lg border border-[#e6ecf2] px-3 py-2 text-sm font-medium text-[#14212e] transition hover:bg-slate-50 active:scale-[0.99] disabled:opacity-60"
          >
            {item.hidden ? "Mostrar" : "Ocultar"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!window.confirm("¿Eliminar este reporte definitivamente?"))
                return;
              run(() => deleteReport(item.table, item.id));
            }}
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 active:scale-[0.99] disabled:opacity-60"
          >
            Eliminar
          </button>
        </div>
      </div>

      {error && <p className="mt-2.5 text-sm font-medium text-red-600">{error}</p>}
    </div>

    {showPhoto && item.photo_url && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4"
        onClick={() => setShowPhoto(false)}
      >
        <div
          className="relative flex flex-col items-center gap-3"
          style={{ width: "60vw", maxWidth: "90vw" }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => setShowPhoto(false)}
            className="absolute -top-3 -right-3 z-10 h-8 w-8 rounded-full bg-white shadow-lg flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition font-bold text-sm"
          >
            ✕
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.photo_url}
            alt={item.label}
            className="w-full rounded-2xl object-contain shadow-2xl border border-white/20"
            style={{ maxHeight: "60vh" }}
          />
          <p className="text-white/80 text-sm font-semibold drop-shadow">{item.label}</p>
        </div>
      </div>
    )}
    </>
  );
}
