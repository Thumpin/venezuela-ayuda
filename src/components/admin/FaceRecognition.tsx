"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";

type Tab = "buscar" | "duplicados" | "conciliacion";

const TABS: { id: Tab; label: string; desc: string }[] = [
  { id: "buscar", label: "Buscar", desc: "Sube una foto → personas parecidas" },
  { id: "duplicados", label: "Duplicados", desc: "Cruza nuestra base por rostro" },
  { id: "conciliacion", label: "Conciliación", desc: "Misma persona en varias bases" },
];

function pct(s?: number) {
  return Math.round((s || 0) * 100);
}

const card = "rounded-xl border border-[#e6ecf2] bg-white p-4";
const btn =
  "rounded-lg bg-[#2563a8] px-4 py-2 text-sm font-semibold text-white active:scale-[0.99] disabled:opacity-50";
const chip = "rounded-full bg-[#eef3fa] px-2 py-0.5 text-[11px] text-[#2563a8]";

export default function FaceRecognition() {
  const [tab, setTab] = useState<Tab>("buscar");
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-xl border px-3 py-2 text-left transition ${
              tab === t.id
                ? "border-[#2563a8] bg-[#eef3fa]"
                : "border-[#e6ecf2] bg-white hover:bg-slate-50"
            }`}
          >
            <div className="text-sm font-semibold text-[#14212e]">{t.label}</div>
            <div className="text-[11px] leading-tight text-[#5b6b7b]">{t.desc}</div>
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "buscar" && <Buscar />}
        {tab === "duplicados" && <Duplicados />}
        {tab === "conciliacion" && <Conciliacion />}
      </div>

      <p className="mt-4 text-xs text-[#8190a0]">
        Herramienta asistiva. Las coincidencias por rostro siempre requieren
        verificación humana; nunca confirman identidad de forma automática.
      </p>
    </div>
  );
}

/* Buscar: subir una foto → top de personas parecidas */
function Buscar() {
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, unknown>[] | null>(null);

  function onFile(f?: File) {
    if (!f) return;
    setFile(f);
    setResults(null);
    setErr(null);
    const r = new FileReader();
    r.onload = (e) => setPreview(e.target?.result as string);
    r.readAsDataURL(f);
  }
  async function run() {
    if (!file) return;
    setLoading(true);
    setErr(null);
    setResults(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/fr/search", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok || d.ok === false)
        setErr(d.error || (r.status === 422 ? "No se detectó rostro." : "Error."));
      else setResults(d.results || []);
    } catch {
      setErr("No se pudo conectar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className={card}>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex h-24 w-24 cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-300 hover:border-[#2563a8]">
          {preview ? (
            <img src={preview} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-center text-xs text-slate-400">📷<br />Subir</span>
          )}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <button onClick={run} disabled={!file || loading} className={btn}>
          {loading ? "Buscando…" : "Buscar parecidos"}
        </button>
      </div>
      {err && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">{err}</p>}
      {results && results.length > 0 && (
        <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {results.map((c, i) => (
            <li key={i} className="flex gap-3 rounded-lg border border-[#e6ecf2] p-2">
              {(c.image_url as string) && (
                <img src={c.image_url as string} alt="" className="h-14 w-14 rounded-md object-cover" />
              )}
              <div className="min-w-0 text-sm">
                <div className="truncate font-medium text-[#14212e]">{(c.person_name as string) || "—"}</div>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className={chip}>{pct(c.score as number)}%</span>
                  {(c.source as string) && <span className="text-[11px] text-[#5b6b7b]">{c.source as string}</span>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {results && results.length === 0 && <p className="mt-3 text-sm text-[#5b6b7b]">Sin resultados.</p>}
    </section>
  );
}

/* Duplicados: cruza nuestra propia base (source = venezuela-ayuda.com) */
function Duplicados() {
  const [min, setMin] = useState("0.7");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<{ checked?: number; duplicates?: Record<string, unknown>[] } | null>(null);
  async function run() {
    setLoading(true);
    setErr(null);
    setRes(null);
    try {
      const r = await fetch(`/api/fr/duplicates?min_score=${min}&limit=300`);
      const d = await r.json();
      if (!r.ok || d.ok === false) setErr(d.error || "Error.");
      else setRes(d);
    } catch {
      setErr("No se pudo conectar.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <section className={card}>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-[#5b6b7b]">
          Similitud mínima
          <input
            type="number"
            step="0.05"
            min="0.3"
            max="1"
            value={min}
            onChange={(e) => setMin(e.target.value)}
            className="ml-2 w-20 rounded-lg border border-[#e6ecf2] px-2 py-1 text-sm"
          />
        </label>
        <button onClick={run} disabled={loading} className={btn}>
          {loading ? "Cruzando base…" : "Buscar duplicados"}
        </button>
      </div>
      {err && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">{err}</p>}
      {res && (
        <>
          <p className="mt-3 text-sm text-[#5b6b7b]">
            Revisados <b>{res.checked}</b> · pares: <b>{res.duplicates?.length || 0}</b>
          </p>
          <ul className="mt-2 space-y-2">
            {(res.duplicates || []).map((p, i) => (
              <li key={i} className="flex items-center gap-3 rounded-lg border border-[#e6ecf2] p-2">
                {(p.a_image as string) && <img src={p.a_image as string} alt="" className="h-12 w-12 rounded-md object-cover" />}
                <span className="text-sm text-[#14212e]">
                  {(p.a_name as string) || "—"} <span className="text-slate-400">↔</span> {(p.b_name as string) || "—"}
                </span>
                {(p.b_image as string) && <img src={p.b_image as string} alt="" className="h-12 w-12 rounded-md object-cover" />}
                <span className="ml-auto rounded-full bg-[#fdf0e9] px-2 py-0.5 text-xs font-semibold text-[#c0512c]">
                  {pct(p.score as number)}%
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/* Conciliación: misma persona entre bases distintas, con sus imágenes */
function Conciliacion() {
  const [min, setMin] = useState("0.55");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<{ checked?: number; groups?: Record<string, unknown>[] } | null>(null);
  async function run() {
    setLoading(true);
    setErr(null);
    setRes(null);
    try {
      const r = await fetch(`/api/fr/reconcile?min_score=${min}&limit=800`);
      const d = await r.json();
      if (!r.ok || d.ok === false) setErr(d.error || "Error.");
      else setRes(d);
    } catch {
      setErr("No se pudo conectar.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <section className={card}>
      <p className="text-sm text-[#5b6b7b]">
        Encuentra a la <b>misma persona</b> reportada en bases distintas y trae sus imágenes de cada base.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="text-sm text-[#5b6b7b]">
          Similitud mínima
          <input
            type="number"
            step="0.05"
            min="0.3"
            max="1"
            value={min}
            onChange={(e) => setMin(e.target.value)}
            className="ml-2 w-20 rounded-lg border border-[#e6ecf2] px-2 py-1 text-sm"
          />
        </label>
        <button onClick={run} disabled={loading} className={btn}>
          {loading ? "Conciliando…" : "Conciliar bases"}
        </button>
      </div>
      {err && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">{err}</p>}
      {res && (
        <>
          <p className="mt-3 text-sm text-[#5b6b7b]">
            Revisados <b>{res.checked}</b> · identidades conciliadas: <b>{res.groups?.length || 0}</b>
          </p>
          <ul className="mt-2 space-y-3">
            {(res.groups || []).map((g, i) => {
              const records = (g.records as Record<string, unknown>[]) || [];
              const sources = (g.sources as string[]) || [];
              return (
                <li key={i} className="rounded-lg border border-[#e6ecf2] p-3">
                  <div className="mb-2 flex items-center gap-2 text-xs">
                    {sources.map((s) => (
                      <span key={s} className={chip}>{s}</span>
                    ))}
                    <span className="ml-auto rounded-full bg-[#eafaf0] px-2 py-0.5 font-semibold text-[#0d9488]">
                      {pct(g.score as number)}%
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {records.map((r, j) => (
                      <div key={j} className="w-28">
                        {(r.image_url as string) ? (
                          <img src={r.image_url as string} alt="" className="h-28 w-28 rounded-md object-cover" />
                        ) : (
                          <div className="flex h-28 w-28 items-center justify-center rounded-md bg-slate-100 text-xs text-slate-400">
                            sin imagen
                          </div>
                        )}
                        <div className="mt-1 truncate text-xs font-medium text-[#14212e]">
                          {(r.person_name as string) || "—"}
                        </div>
                        <div className="truncate text-[11px] text-[#2563a8]">{r.source as string}</div>
                      </div>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
