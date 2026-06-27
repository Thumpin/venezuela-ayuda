"use client";

import { useState } from "react";
import { ingestBatch } from "@/app/admin/actions";

type Format = "auto" | "json" | "csv" | "sql";
type Outcome = {
  accepted?: number;
  rejected?: number;
  errored?: number;
  sample?: Array<{ external_id: string | null; status: string; error?: string }>;
};

export default function BatchIngest() {
  const [text, setText] = useState("");
  const [source, setSource] = useState("");
  const [format, setFormat] = useState<Format>("auto");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Outcome | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const res = await ingestBatch({ text, source, format });
      if (!res.ok && res.accepted === undefined) {
        setError(res.error ?? "No se pudo procesar.");
      } else {
        setResult(res);
      }
    } catch {
      setError("No se pudo procesar la carga.");
    }
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="rounded-2xl border border-[#e6ecf2] bg-white p-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[#14212e]">
            Source (etiqueta del lote)
          </span>
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            required
            placeholder="ej: cruzroja-dump-2026"
            className="w-full rounded-xl border border-[#e6ecf2] px-3.5 py-3 text-base outline-none transition focus:border-[#2563a8]"
          />
          <span className="mt-1 block text-xs text-[#8190a0]">
            Cada fila se guarda con este source. Re-cargar el mismo source +
            external_id actualiza la fila (idempotente).
          </span>
        </label>

        <div className="mt-3">
          <span className="mb-1.5 block text-sm font-medium text-[#14212e]">Formato</span>
          <div className="flex flex-wrap gap-2">
            {(["auto", "json", "csv", "sql"] as Format[]).map((f) => (
              <button
                type="button"
                key={f}
                onClick={() => setFormat(f)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                  format === f
                    ? "border-[#2563a8] bg-[#2563a8] text-white"
                    : "border-[#e6ecf2] text-[#14212e] hover:bg-slate-50"
                }`}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <label className="mt-3 block">
          <span className="mb-1.5 block text-sm font-medium text-[#14212e]">
            Datos (JSON array, CSV con encabezados, o sentencias INSERT)
          </span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            required
            rows={12}
            spellCheck={false}
            placeholder={`[{"type":"help_request","external_id":"x1","category":"water","description":"agua","latitude":10.5,"longitude":-66.9}]`}
            className="w-full rounded-xl border border-[#e6ecf2] px-3.5 py-3 font-mono text-xs outline-none transition focus:border-[#2563a8]"
          />
          <span className="mt-1 block text-xs text-[#8190a0]">
            Campos: type (checkin · missing_person · help_request · help_offer ·
            damaged_building), external_id (requerido), y los campos del reporte.
            El SQL nunca se ejecuta: solo se extraen los valores de INSERT … VALUES.
          </span>
        </label>

        <button
          type="submit"
          disabled={pending}
          style={{ backgroundColor: "#2563a8" }}
          className="mt-3 rounded-xl px-5 py-3 text-base font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Procesando…" : "Cargar datos"}
        </button>
        {error && <p className="mt-2.5 text-sm font-medium text-red-600">{error}</p>}
      </div>

      {result && (
        <div className="rounded-2xl border border-[#e6ecf2] bg-white p-4">
          <p className="text-sm font-semibold text-[#14212e]">Resultado</p>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 font-bold text-emerald-700">
              {result.accepted ?? 0} aceptados
            </span>
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 font-bold text-amber-700">
              {result.rejected ?? 0} rechazados
            </span>
            <span className="rounded-full bg-red-100 px-2.5 py-0.5 font-bold text-red-700">
              {result.errored ?? 0} con error
            </span>
          </div>
          {result.sample && result.sample.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-[#5b6b7b]">
              {result.sample.map((r, i) => (
                <li key={i} className="font-mono">
                  {r.status === "rejected" ? "⚠️" : "❌"} {r.external_id ?? "(sin id)"} — {r.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
