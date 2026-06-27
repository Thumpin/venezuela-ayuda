"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import StatusBadge from "@/components/StatusBadge";
import SourceBadge from "@/components/SourceBadge";
import { timeAgo } from "@/lib/format";
import { CHECKIN_STATUSES, FOUND_BADGE } from "@/lib/constants";
import type { MergedPerson } from "@/lib/people";
import { updateCheckinStatus } from "@/app/actions";
import { getOptimizedPhotoUrl } from "@/lib/imageOptimizer";

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

const STATUS_OPTIONS = [
  { value: "SAFE", label: "✅ A Salvo" },
  { value: "HOSPITALIZADO", label: "🏥 Hospitalizado/a" },
  { value: "DIFUNTO", label: "🕊️ Fallecido/a" },
  { value: "LOOKING_FOR_SOMEONE", label: "🔎 Sigue desaparecido/a" },
] as const;

export default function PersonResultCard({ p }: { p: MergedPerson }) {
  const [showModal, setShowModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string>(p.status);
  const [inputToken, setInputToken] = useState("");
  const [storedToken, setStoredToken] = useState<string | null>(null);
  const [statusPending, setStatusPending] = useState(false);
  const [statusSuccess, setStatusSuccess] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const t = useTranslations("search");
  const tD = useTranslations("domain");
  const s = CHECKIN_STATUSES[p.status];
  const primary = p.sources[0];
  const extra = p.sources.length - 1;

  useEffect(() => {
    if (p.checkinId) {
      try {
        const token = localStorage.getItem("manage:" + p.checkinId);
        if (token) {
          setStoredToken(token);
          setInputToken(token);
        }
      } catch {
        // localStorage not available
      }
    }
  }, [p.checkinId]);

  async function handleStatusChange(e: React.FormEvent) {
    e.preventDefault();
    if (!p.checkinId) return;
    const token = inputToken.trim() || storedToken || "";
    if (!token) {
      setStatusError("Se requiere la clave de gestión para realizar cambios.");
      return;
    }

    setStatusPending(true);
    setStatusError(null);
    setStatusSuccess(null);

    try {
      const res = await updateCheckinStatus(
        p.checkinId,
        token,
        selectedStatus as any
      );
      if (res.ok) {
        setStatusSuccess("El estado ha sido actualizado con éxito.");
        try {
          localStorage.setItem("manage:" + p.checkinId, token);
          setStoredToken(token);
        } catch {
          // localStorage not available
        }
        setTimeout(() => {
          setShowStatusModal(false);
          setStatusSuccess(null);
        }, 1500);
      } else {
        setStatusError(res.error ?? "No se pudo actualizar el estado.");
      }
    } catch {
      setStatusError("Ocurrió un error al intentar actualizar.");
    } finally {
      setStatusPending(false);
    }
  }

  return (
    <>
      <div className="min-w-0 rounded-2xl border border-[#e6ecf2] bg-white p-4 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-200 flex flex-col justify-between gap-3">
        <div className="flex items-start gap-4">
          {p.photoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={getOptimizedPhotoUrl(p.photoUrl, 128)}
              alt={p.name}
              loading="lazy"
              decoding="async"
              className="h-16 w-16 shrink-0 rounded-xl object-cover border border-slate-100 shadow-sm cursor-pointer hover:opacity-90 transition"
              onClick={() => setShowModal(true)}
            />
          ) : (
            <span
              aria-hidden
              className="grid h-16 w-16 shrink-0 place-items-center rounded-xl text-sm font-bold shadow-sm"
              style={{ backgroundColor: s.tintBg, color: s.tintText }}
            >
              {initials(p.name)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-bold text-[#14212e] leading-snug">{p.name}</h3>
            <div className="mt-1 flex flex-col gap-1 text-[11px] text-[#8190a0]">
              {p.locations.length > 0 && (
                <span className="flex items-center gap-1 font-medium text-slate-600 truncate">
                  📍 {p.locations.join(" · ")}
                </span>
              )}
              <span className="flex items-center gap-1">
                🕒 {p.updated ? t("card.metaUpdated", { time: timeAgo(p.updated) }) : t("card.noDate")}
              </span>
            </div>
          </div>
          <div className="shrink-0 flex flex-col items-end gap-1.5">
            {p.found ? (
              <>
                <span
                  className="rounded-full px-3 py-1.5 text-xs font-bold shadow-sm"
                  style={{ backgroundColor: FOUND_BADGE.tintBg, color: FOUND_BADGE.tintText }}
                >
                  {FOUND_BADGE.emoji} {tD("foundBadge")}
                </span>
                {p.hospitalName && (
                  <span className="text-[10px] font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded-md flex items-center gap-1 border border-red-100 shadow-sm">
                    <span className="text-xs">✚</span> {p.hospitalName}
                  </span>
                )}
              </>
            ) : (
              <StatusBadge status={p.status} />
            )}
          </div>
        </div>

        {p.description && (
          <div className="bg-slate-50/60 rounded-xl p-3 border border-slate-100/80">
            <p className="line-clamp-2 text-sm text-[#5b6b7b] italic">“{p.description}”</p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between border-t border-slate-100 pt-2.5 mt-1 text-xs text-[#8190a0]">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-slate-400">Origen:</span>
            {primary?.label === "la app" && primary.href ? (
              <Link
                href={primary.href}
                className="inline-block font-semibold text-[#2563a8] hover:underline"
              >
                {t("card.viewInApp")}
              </Link>
            ) : primary ? (
              <SourceBadge source={primary.label} url={primary.href} />
            ) : (
              <span>Desconocido</span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {extra > 0 && (
              <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                +{extra} {t("card.moreSources", { count: extra }).replace(/[\d\s·]+/, "")}
              </span>
            )}
            {p.checkinId && (
              <button
                type="button"
                onClick={() => setShowStatusModal(true)}
                className="text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg px-2.5 py-1 transition"
              >
                🔄 Cambiar Estado
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="text-xs font-semibold text-[#2563a8] bg-[#2563a8]/5 hover:bg-[#2563a8]/10 rounded-lg px-2.5 py-1 transition"
            >
              👁️ Ver Detalles
            </button>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl relative flex flex-col gap-4 animate-in fade-in zoom-in duration-200">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-lg font-bold"
            >
              ✕
            </button>
            
            <div className="flex items-center gap-4 border-b border-slate-100 pb-4">
              {p.photoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={getOptimizedPhotoUrl(p.photoUrl, 128)}
                  alt={p.name}
                  loading="lazy"
                  decoding="async"
                  className="h-16 w-16 rounded-xl object-cover border border-slate-100 shadow-sm"
                />
              ) : (
                <span
                  aria-hidden
                  className="grid h-16 w-16 place-items-center rounded-xl text-lg font-bold shadow-sm"
                  style={{ backgroundColor: s.tintBg, color: s.tintText }}
                >
                  {initials(p.name)}
                </span>
              )}
              <div>
                <h2 className="text-xl font-bold text-[#14212e]">{p.name}</h2>
                <p className="text-xs text-[#8190a0]">
                  Actualizado: {p.updated ? timeAgo(p.updated) : "Sin fecha"}
                </p>
              </div>
            </div>

            {p.photoUrl && (
              <div className="rounded-xl overflow-hidden border border-slate-100 bg-slate-50 flex justify-center max-h-[300px]">
                <img
                  src={getOptimizedPhotoUrl(p.photoUrl, 600)}
                  alt={p.name}
                  loading="lazy"
                  decoding="async"
                  className="object-contain max-h-[300px]"
                />
              </div>
            )}

            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="font-semibold text-slate-600">Estado de búsqueda:</span>
                {p.found ? (
                  <span
                    className="rounded-full px-3 py-1 text-xs font-bold shadow-sm"
                    style={{ backgroundColor: FOUND_BADGE.tintBg, color: FOUND_BADGE.tintText }}
                  >
                    {FOUND_BADGE.emoji} {tD("foundBadge")}
                  </span>
                ) : (
                  <StatusBadge status={p.status} />
                )}
              </div>

              {p.hospitalName && (
                <div className="flex justify-between items-center bg-red-50 p-3 rounded-xl border border-red-100">
                  <span className="font-semibold text-red-900">Hospitalizado en:</span>
                  <span className="text-xs font-bold text-red-700 bg-white border border-red-200 rounded-md px-2 py-0.5 shadow-sm">
                    🏥 {p.hospitalName}
                  </span>
                </div>
              )}

              {p.locations.length > 0 && (
                <div className="bg-slate-50/50 p-3 rounded-xl border border-slate-100/60">
                  <span className="font-semibold text-slate-600 block mb-1">📍 Ubicaciones reportadas:</span>
                  <p className="text-[#5b6b7b]">{p.locations.join(" · ")}</p>
                </div>
              )}

              {p.description && (
                <div className="bg-slate-50/50 p-3 rounded-xl border border-slate-100/60">
                  <span className="font-semibold text-slate-600 block mb-1">📝 Detalles / Descripción:</span>
                  <p className="text-[#5b6b7b] italic">“{p.description}”</p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 mt-1">
              {p.checkinId && (
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setShowStatusModal(true);
                  }}
                  className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 px-5 py-2 text-sm font-semibold hover:bg-amber-100 transition mr-auto"
                >
                  🔄 Cambiar Estado
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-lg bg-[#2563a8] text-white px-5 py-2 text-sm font-semibold shadow hover:bg-[#1a4a82] transition"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {showStatusModal && p.checkinId && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative flex flex-col gap-4 animate-in fade-in zoom-in duration-200">
            <button
              type="button"
              onClick={() => {
                setShowStatusModal(false);
                setStatusError(null);
                setStatusSuccess(null);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-lg font-bold"
            >
              ✕
            </button>

            <div>
              <h2 className="text-xl font-bold text-[#14212e] flex items-center gap-2">
                <span>🔄</span> Cambiar Estado de Reporte
              </h2>
              <p className="text-xs text-[#8190a0] mt-1">
                {p.name}
              </p>
            </div>

            <form onSubmit={handleStatusChange} className="space-y-4">
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700">
                  Nuevo Estado:
                </label>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700">
                  Clave de gestión (manage token):
                </label>
                <input
                  type="text"
                  value={inputToken}
                  onChange={(e) => setInputToken(e.target.value)}
                  placeholder="Introduce la clave de gestión"
                  required
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm"
                />
                {storedToken ? (
                  <p className="text-[11px] text-green-600 font-medium">
                    ✓ Clave recuperada automáticamente de este dispositivo.
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-400">
                    Esta clave la recibiste al crear el reporte en la app.
                  </p>
                )}
              </div>

              {statusError && (
                <p className="text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg p-2">
                  ⚠️ {statusError}
                </p>
              )}

              {statusSuccess && (
                <p className="text-xs font-semibold text-green-700 bg-green-50 border border-green-100 rounded-lg p-2">
                  ✅ {statusSuccess}
                </p>
              )}

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 mt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowStatusModal(false);
                    setStatusError(null);
                    setStatusSuccess(null);
                  }}
                  className="rounded-lg border border-slate-200 text-slate-700 px-4 py-2 text-sm font-semibold hover:bg-slate-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={statusPending}
                  className="rounded-lg bg-[#2563a8] text-white px-4 py-2 text-sm font-semibold shadow hover:bg-[#1a4a82] transition disabled:opacity-50"
                >
                  {statusPending ? "Guardando..." : "Guardar Cambios"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
