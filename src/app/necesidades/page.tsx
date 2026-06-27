import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import { getActiveNeeds, type NeedKind } from "@/lib/data";
import {
  HELP_CATEGORIES,
  URGENCY_LEVELS,
  type HelpCategory,
} from "@/lib/constants";

export const revalidate = 30;

export const metadata: Metadata = {
  title: "Quién necesita ayuda — Venezuela Ayuda",
  description:
    "Lista de personas y lugares que necesitan ayuda ahora. Filtra por tipo, categoría y ciudad.",
};

const KIND_META: Record<NeedKind, { emoji: string; label: string }> = {
  persona: { emoji: "🆘", label: "Persona" },
  lugar: { emoji: "📍", label: "Lugar" },
  desaparecido: { emoji: "🔎", label: "Desaparecido" },
};

const TABS: Array<{ value?: NeedKind; label: string }> = [
  { value: undefined, label: "Todos" },
  { value: "persona", label: "Personas" },
  { value: "lugar", label: "Lugares" },
  { value: "desaparecido", label: "Desaparecidos" },
];

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; categoria?: string; ciudad?: string }>;
}) {
  const sp = await searchParams;
  const tipo: NeedKind | undefined =
    sp.tipo === "persona" || sp.tipo === "lugar" || sp.tipo === "desaparecido"
      ? sp.tipo
      : undefined;
  const ciudad = sp.ciudad?.trim() || undefined;
  const categoria =
    sp.categoria && sp.categoria in HELP_CATEGORIES
      ? (sp.categoria as HelpCategory)
      : undefined;

  const needs = await getActiveNeeds({ kind: tipo, category: categoria, city: ciudad });

  // Build hrefs that preserve the other active filters.
  const href = (over: { tipo?: NeedKind; categoria?: HelpCategory }) => {
    const p = new URLSearchParams();
    const t = "tipo" in over ? over.tipo : tipo;
    const c = "categoria" in over ? over.categoria : categoria;
    if (t) p.set("tipo", t);
    if (c) p.set("categoria", c);
    if (ciudad) p.set("ciudad", ciudad);
    const qs = p.toString();
    return qs ? `/necesidades?${qs}` : "/necesidades";
  };

  return (
    <>
      <Header />
      <main id="contenido" className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800"
        >
          ← Inicio
        </Link>
        <h1 className="mt-3 text-2xl font-extrabold text-slate-900">
          🆘 Quién necesita ayuda
        </h1>
        <p className="mt-1 text-[#5b6b7b]">
          Personas y lugares que necesitan ayuda ahora. Lo más urgente primero.
        </p>

        {/* Kind tabs */}
        <div className="mt-4 flex flex-wrap gap-2">
          {TABS.map((t) => {
            const active = tipo === t.value || (!tipo && !t.value);
            return (
              <Link
                key={t.label}
                href={href({ tipo: t.value, categoria: undefined })}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${
                  active ? "bg-[#2563a8] text-white" : "bg-[#eef3fa] text-[#2563a8]"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </div>

        {/* Category chips — only meaningful for place-requests */}
        {tipo === "lugar" && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={href({ categoria: undefined })}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                !categoria ? "bg-[#14212e] text-white" : "bg-slate-100 text-[#5b6b7b]"
              }`}
            >
              Todas
            </Link>
            {(Object.keys(HELP_CATEGORIES) as HelpCategory[]).map((key) => (
              <Link
                key={key}
                href={href({ categoria: key })}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  categoria === key ? "bg-[#14212e] text-white" : "bg-slate-100 text-[#5b6b7b]"
                }`}
              >
                {HELP_CATEGORIES[key].emoji} {HELP_CATEGORIES[key].label}
              </Link>
            ))}
          </div>
        )}

        {/* City filter */}
        <form method="get" className="mt-3 flex gap-2">
          {tipo && <input type="hidden" name="tipo" value={tipo} />}
          {categoria && <input type="hidden" name="categoria" value={categoria} />}
          <input
            name="ciudad"
            defaultValue={ciudad}
            placeholder="Filtra por ciudad"
            aria-label="Ciudad"
            maxLength={80}
            className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-base"
          />
          <button
            type="submit"
            className="shrink-0 rounded-xl bg-[#2563a8] px-5 py-2.5 font-semibold text-white active:scale-[0.99]"
          >
            Filtrar
          </button>
        </form>

        {/* Results */}
        <div className="mt-6">
          {needs.length === 0 ? (
            <div className="rounded-2xl border border-[#e6ecf2] bg-white p-6 text-center text-[#5b6b7b]">
              <p className="font-semibold text-[#14212e]">
                No hay necesidades activas que coincidan.
              </p>
            </div>
          ) : (
            <>
              <p className="mb-3 text-sm text-[#8190a0]">{needs.length} resultado(s)</p>
              <div className="grid gap-3">
                {needs.map((n) => {
                  const k = KIND_META[n.kind];
                  const urgency = n.urgency ? URGENCY_LEVELS[n.urgency] : null;
                  return (
                    <Link
                      key={`${n.kind}_${n.id}`}
                      href={n.href}
                      className="block min-w-0 overflow-hidden rounded-2xl border border-[#e6ecf2] bg-white p-4 transition hover:border-[#c9d6e3]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-[#14212e]">
                          {n.title}
                        </h2>
                        {urgency && (
                          <span
                            className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold"
                            style={{ backgroundColor: urgency.tintBg, color: urgency.color }}
                          >
                            {urgency.label}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#8190a0]">
                        <span className="rounded-full bg-[#eef3fa] px-2.5 py-1 font-medium text-[#2563a8]">
                          {k.emoji} {k.label}
                        </span>
                        {n.city && <span>📍 {n.city}</span>}
                        {n.responseCount ? (
                          <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
                            🤝 {n.responseCount}
                          </span>
                        ) : null}
                      </div>
                      {n.subtitle && (
                        <p className="mt-2 line-clamp-2 break-words text-sm text-[#5b6b7b]">
                          {n.subtitle}
                        </p>
                      )}
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
