"use client";

import { useState } from "react";
import CenterAdminRow from "./CenterAdminRow";
import DamagedAdminRow from "./DamagedAdminRow";
import ModerationRow from "./ModerationRow";
import { updateHospitalizedPatient, autoMarkAsHospitalized } from "@/app/admin/actions";

interface AdminTabsProps {
  centers: any[];
  damaged: any[];
  mod: any[];
  hospitalized: any[];
}

function HospitalizedAdminRow({ item, peopleItems }: { item: any; peopleItems: any[] }) {
  const [isEditing, setIsEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nombre, setNombre] = useState(item.nombre || "");
  const [apellido, setApellido] = useState(item.apellido || "");
  const [ci, setCi] = useState(item.ci || "");
  const [edad, setEdad] = useState(item.edad || "");
  const [hospital, setHospital] = useState(item.hospital || "");
  const [status, setStatus] = useState(item.status || "");
  const [notas, setNotas] = useState(item.notas || "");
  const [fuentes, setFuentes] = useState(item.fuentes || "");

  // Match states
  const [pendingMatch, setPendingMatch] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);

  // Token-based matching
  const toTokens = (n: string) =>
    n
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter((t) => t.length >= 3);

  const hTokens = new Set(toTokens(`${item.nombre || ""} ${item.apellido || ""}`));
  const matchedPerson = hTokens.size > 0
    ? peopleItems.find((m) => {
        if (m.status !== "LOOKING_FOR_SOMEONE") return false;
        const searchTokens = toTokens(m.label);
        return searchTokens.length > 0 && searchTokens.every((t) => hTokens.has(t));
      })
    : null;

  async function handleAutoMark(checkinId: string) {
    setPendingMatch(true);
    setMatchError(null);
    try {
      const res = await autoMarkAsHospitalized(checkinId, item.hospital || "Centro de Salud");
      if (res.ok) {
        location.reload();
      } else {
        setMatchError(res.error ?? "No se pudo actualizar el estado.");
      }
    } catch {
      setMatchError("Error de red o comunicación.");
    } finally {
      setPendingMatch(false);
    }
  }

  async function handleSave() {
    setPending(true);
    setError(null);
    try {
      const res = await updateHospitalizedPatient(item.id, {
        nombre,
        apellido,
        ci,
        edad,
        hospital,
        status,
        notas,
        fuentes,
      });
      if (res.ok) {
        setIsEditing(false);
        location.reload();
      } else {
        setError(res.error ?? "No se pudo actualizar.");
      }
    } catch (err) {
      setError("Ocurrió un error inesperado.");
    } finally {
      setPending(false);
    }
  }

  if (isEditing) {
    return (
      <div className="rounded-2xl border border-[#e6ecf2] bg-white p-5 flex flex-col gap-4 shadow-md transition-all duration-200">
        <h4 className="font-bold text-[#14212e]">✏️ Completar Detalles del Registro</h4>
        
        {error && <p className="text-xs font-semibold text-red-600 bg-red-50 p-2 rounded-md border border-red-100">{error}</p>}
        
        <div className="grid gap-3 sm:grid-cols-2 text-sm">
          <div>
            <label className="block text-xs font-semibold text-[#5b6b7b] mb-1">Nombre</label>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-slate-50 focus:bg-white transition"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Carlos Eduardo"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#5b6b7b] mb-1">Apellido</label>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-slate-50 focus:bg-white transition"
              value={apellido}
              onChange={(e) => setApellido(e.target.value)}
              placeholder="Ej: Mendoza"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#5b6b7b] mb-1">Cédula</label>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-slate-50 focus:bg-white transition"
              value={ci}
              onChange={(e) => setCi(e.target.value)}
              placeholder="Ej: V-12345678"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#5b6b7b] mb-1">Edad</label>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-slate-50 focus:bg-white transition"
              value={edad}
              onChange={(e) => setEdad(e.target.value)}
              placeholder="Ej: 29"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#5b6b7b] mb-1">Hospital / Centro de Salud</label>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-slate-50 focus:bg-white transition"
              value={hospital}
              onChange={(e) => setHospital(e.target.value)}
              placeholder="Ej: Hospital Vargas"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#5b6b7b] mb-1">Estado de Salud</label>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-slate-50 focus:bg-white transition"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              placeholder="Ej: Estable, En Observación"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-[#5b6b7b] mb-1">Fuente</label>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-slate-50 focus:bg-white transition"
              value={fuentes}
              onChange={(e) => setFuentes(e.target.value)}
              placeholder="Ej: Registro Oficial / Cruz Roja"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-[#5b6b7b] mb-1">Notas Médicas / Diagnóstico</label>
            <textarea
              className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-slate-50 focus:bg-white transition min-h-[60px]"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Información relevante de ingreso, diagnóstico o estado general..."
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
    <div className="rounded-2xl border border-[#e6ecf2] bg-white p-4 flex flex-col gap-2 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h4 className="font-bold text-base text-[#14212e]">
            👤 {item.nombre} {item.apellido}
          </h4>
          <p className="text-xs text-[#8190a0] mt-0.5">
            Cédula: <span className="font-medium text-[#5b6b7b]">{item.ci || "Sin registrar"}</span> · Edad: <span className="font-medium text-[#5b6b7b]">{item.edad ? `${item.edad} años` : "Sin registrar"}</span>
          </p>
        </div>
        <span className="text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-md px-2.5 py-1 shrink-0 shadow-sm">
          🏥 {item.hospital || "Sin hospital"}
        </span>
      </div>
      
      {(item.status || item.notas || item.fuentes) && (
        <div className="bg-slate-50/50 rounded-xl p-3 border border-slate-100/60 text-xs text-[#5b6b7b] space-y-1.5">
          {item.status && <p><strong>Estado:</strong> {item.status}</p>}
          {item.fuentes && <p><strong>Fuente:</strong> {item.fuentes}</p>}
          {item.notas && <p><strong>Notas:</strong> {item.notas}</p>}
        </div>
      )}

      {matchedPerson && (
        <div className="mt-2 bg-amber-50 border border-amber-100 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-800">
          <div className="min-w-0 flex-1">
            <span className="font-bold">⚠️ Coincidencia Detectada:</span> Coincide con el reporte de desaparecido <strong className="text-amber-950">"{matchedPerson.label}"</strong>.
            {matchError && <p className="mt-1 text-red-600 font-semibold">{matchError}</p>}
          </div>
          <button
            type="button"
            disabled={pendingMatch}
            onClick={() => handleAutoMark(matchedPerson.id)}
            className="rounded-lg bg-amber-600 text-white px-3 py-1.5 font-semibold hover:bg-amber-700 transition disabled:opacity-50 shadow-sm shrink-0"
          >
            {pendingMatch ? "Marcando..." : "🔄 Marcar como Hospitalizado"}
          </button>
        </div>
      )}

      <div className="flex justify-end border-t border-slate-100 pt-2.5 mt-0.5">
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="rounded-lg border border-[#e6ecf2] px-3.5 py-1.5 text-xs font-semibold text-[#2563a8] bg-[#2563a8]/5 hover:bg-[#2563a8]/10 transition active:scale-[0.99]"
        >
          ✏️ Completar / Editar Detalles
        </button>
      </div>
    </div>
  );
}

export default function AdminTabs({ centers, damaged, mod, hospitalized }: AdminTabsProps) {
  const [activeTab, setActiveTab] = useState<
    "acopio" | "hospitales" | "hospitalizados" | "personas" | "solicitudes" | "ofrecimientos" | "edificios"
  >("acopio");

  const acopioCenters = centers.filter(c => c.source !== "hospital-cross-reference");
  const medicalCenters = centers.filter(c => c.source === "hospital-cross-reference");

  const pendingAcopio = acopioCenters.filter(c => !c.verified).length;
  const pendingMedical = medicalCenters.filter(c => !c.verified).length;

  const peopleItems = mod.filter(m => m.table === "checkins");
  const requestItems = mod.filter(m => m.table === "help_requests");
  const offerItems = mod.filter(m => m.table === "help_offers");

  const tabs = [
    {
      id: "acopio" as const,
      label: "📦 Centros de acopio",
      count: acopioCenters.length,
      pending: pendingAcopio,
    },
    {
      id: "hospitales" as const,
      label: "🏥 Hospitales",
      count: medicalCenters.length,
      pending: pendingMedical,
    },
    {
      id: "hospitalizados" as const,
      label: "👥 Hospitalizados (Pacientes)",
      count: hospitalized.length,
      pending: 0,
    },
    {
      id: "personas" as const,
      label: "👤 Desaparecidos",
      count: peopleItems.length,
      pending: 0,
    },
    {
      id: "solicitudes" as const,
      label: "🆘 Solicitudes",
      count: requestItems.length,
      pending: 0,
    },
    {
      id: "ofrecimientos" as const,
      label: "🤝 Ofrecimientos",
      count: offerItems.length,
      pending: 0,
    },
    {
      id: "edificios" as const,
      label: "🏚️ Edificios dañados",
      count: damaged.length,
      pending: 0,
    },
  ];

  return (
    <div className="mt-8">
      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2 border-b border-[#e6ecf2] pb-2">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                isActive
                  ? "bg-[#2563a8] text-white"
                  : "text-[#5b6b7b] hover:bg-slate-50"
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  isActive ? "bg-white/25 text-white" : "bg-amber-100 text-amber-700"
                }`}
              >
                {tab.count}
              </span>
              {tab.pending > 0 && (
                <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {tab.pending}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Contents */}
      <div className="mt-6">
        {activeTab === "acopio" && (
          <div>
            <h3 className="text-base font-semibold text-[#14212e] mb-4">Centros de acopio registrados</h3>
            {acopioCenters.length === 0 ? (
              <p className="text-sm text-[#8190a0]">No hay centros de acopio.</p>
            ) : (
              <div className="space-y-3">
                {acopioCenters.map((c) => (
                  <CenterAdminRow item={c} key={c.id} />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "hospitales" && (
          <div>
            <h3 className="text-base font-semibold text-[#14212e] mb-4">Centros hospitalarios registrados</h3>
            {medicalCenters.length === 0 ? (
              <p className="text-sm text-[#8190a0]">No hay hospitales registrados.</p>
            ) : (
              <div className="space-y-3">
                {medicalCenters.map((c) => (
                  <CenterAdminRow item={c} key={c.id} />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "hospitalizados" && (
          <div>
            <h3 className="text-base font-semibold text-[#14212e] mb-4">Personas Hospitalizadas (Últimas ingresadas)</h3>
            {hospitalized.length === 0 ? (
              <p className="text-sm text-[#8190a0]">No hay personas hospitalizadas registradas.</p>
            ) : (
              <div className="space-y-3">
                {hospitalized.map((h) => (
                  <HospitalizedAdminRow item={h} key={h.id} peopleItems={peopleItems} />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "personas" && (
          <div>
            <h3 className="text-base font-semibold text-[#14212e] mb-4">Personas Reportadas Desaparecidas</h3>
            {peopleItems.length === 0 ? (
              <p className="text-sm text-[#8190a0]">No hay reportes de personas desaparecidas.</p>
            ) : (
              <div className="space-y-3">
                {peopleItems.map((m) => {
                  // Token-based fuzzy match: strip accents/punctuation, split into
                  // significant tokens (≥3 chars), require all search tokens to appear
                  // in the hospital record — consistent with the fuzzyKey dedup logic.
                  const toTokens = (n: string) =>
                    n
                      .toLowerCase()
                      .normalize("NFD")
                      .replace(/[\u0300-\u036f]/g, "")
                      .replace(/[^a-z0-9 ]/g, " ")
                      .replace(/\s+/g, " ")
                      .trim()
                      .split(" ")
                      .filter((t) => t.length >= 3);

                  const getHospitalNameForPerson = (name: string) => {
                    const searchTokens = toTokens(name);
                    if (searchTokens.length === 0) return null;
                    const match = hospitalized.find((h) => {
                      const hTokens = new Set(toTokens(`${h.nombre} ${h.apellido}`));
                      // All search tokens must appear in the hospital record's token set
                      return searchTokens.length > 0 && searchTokens.every((t) => hTokens.has(t));
                    });
                    return match ? match.hospital : null;
                  };

                  return (
                    <ModerationRow
                      item={m}
                      key={m.table + m.id}
                      hospitalName={getHospitalNameForPerson(m.label)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "solicitudes" && (
          <div>
            <h3 className="text-base font-semibold text-[#14212e] mb-4">Solicitudes de ayuda de la comunidad</h3>
            {requestItems.length === 0 ? (
              <p className="text-sm text-[#8190a0]">No hay solicitudes de ayuda.</p>
            ) : (
              <div className="space-y-3">
                {requestItems.map((m) => (
                  <ModerationRow item={m} key={m.table + m.id} />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "ofrecimientos" && (
          <div>
            <h3 className="text-base font-semibold text-[#14212e] mb-4">Ofrecimientos de ayuda y donaciones</h3>
            {offerItems.length === 0 ? (
              <p className="text-sm text-[#8190a0]">No hay ofrecimientos de ayuda.</p>
            ) : (
              <div className="space-y-3">
                {offerItems.map((m) => (
                  <ModerationRow item={m} key={m.table + m.id} />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "edificios" && (
          <div>
            <h3 className="text-base font-semibold text-[#14212e] mb-4">Reportes de edificaciones dañadas</h3>
            {damaged.length === 0 ? (
              <p className="text-sm text-[#8190a0]">No hay reportes de edificios dañados.</p>
            ) : (
              <div className="space-y-3">
                {damaged.map((d) => (
                  <DamagedAdminRow item={d} key={d.id} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
