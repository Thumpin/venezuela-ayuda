import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import ChildAdminRow from "@/components/admin/ChildAdminRow";
import {
  getAdminSession,
  listUnaccompaniedChildrenAdmin,
  listChildCustodyEvents,
  type AdminChildRow,
  type AdminCustodyEventRow,
} from "@/lib/admin";
import { ageToYears } from "@/lib/format";

export const dynamic = "force-dynamic";

const RECENT_MS = 7 * 24 * 60 * 60 * 1000;

// "Paradero actualizado recientemente": evento de custodia en los últimos 7 días.
const isRecent = (c: AdminChildRow) =>
  !!c.last_custody_at &&
  Date.now() - new Date(c.last_custody_at).getTime() <= RECENT_MS;

// Rangos de edad. ageToYears parsea el número inicial del campo, así funciona
// tanto con registros antiguos de texto libre como con los estandarizados.
const AGE_BUCKETS: Array<{
  key: string;
  label: string;
  test: (c: AdminChildRow) => boolean;
}> = [
  {
    key: "0-5",
    label: "0–5",
    test: (c) => {
      const y = ageToYears(c.age);
      return y != null && y <= 5;
    },
  },
  {
    key: "6-12",
    label: "6–12",
    test: (c) => {
      const y = ageToYears(c.age);
      return y != null && y >= 6 && y <= 12;
    },
  },
  {
    key: "13-18",
    label: "13–18",
    test: (c) => {
      const y = ageToYears(c.age);
      return y != null && y >= 13 && y <= 18;
    },
  },
  {
    key: "desconocida",
    label: "Desconocida",
    test: (c) => ageToYears(c.age) == null,
  },
];

// Chip de filtro con contador — mismo patrón que SubFilters en /admin.
function FilterChip({
  href,
  active,
  label,
  count,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition ${
        active ? "bg-[#14212e] text-white" : "bg-slate-100 text-[#5b6b7b] hover:bg-slate-200"
      }`}
    >
      {label}
      <span
        className={`rounded-full px-1.5 text-[11px] font-bold ${
          active ? "bg-white/25 text-white" : "bg-white text-[#8190a0]"
        }`}
      >
        {count}
      </span>
    </Link>
  );
}

export default async function NinosAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; edad?: string; reciente?: string }>;
}) {
  const session = await getAdminSession();
  if (!session?.isSuper) redirect("/admin"); // super-admin only

  const children = await listUnaccompaniedChildrenAdmin();
  const events = await listChildCustodyEvents(children.map((c) => c.id));

  // Agrupa los eventos por child_id (ya vienen ordenados por seq desc).
  const byChild = new Map<string, AdminCustodyEventRow[]>();
  for (const e of events) {
    const list = byChild.get(e.child_id) ?? [];
    list.push(e);
    byChild.set(e.child_id, list);
  }

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const edad = sp.edad;
  const reciente = sp.reciente === "1";

  // Filtros combinables (AND) sobre la lista ya traída.
  const ageBucket = AGE_BUCKETS.find((b) => b.key === edad);
  const filtered = children.filter((c) => {
    if (q && !c.name.toLowerCase().includes(q.toLowerCase())) return false;
    if (ageBucket && !ageBucket.test(c)) return false;
    if (reciente && !isRecent(c)) return false;
    return true;
  });

  // Construye un href preservando los demás filtros activos.
  const buildHref = (overrides: {
    q?: string;
    edad?: string;
    reciente?: string;
  }) => {
    const next = { q, edad, reciente: reciente ? "1" : undefined, ...overrides };
    const params = new URLSearchParams();
    if (next.q) params.set("q", next.q);
    if (next.edad) params.set("edad", next.edad);
    if (next.reciente) params.set("reciente", "1");
    const qs = params.toString();
    return qs ? `/admin/ninos?${qs}` : "/admin/ninos";
  };

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-sm font-medium text-[#2563a8] hover:underline"
        >
          ← Volver al panel
        </Link>
        <h1 className="mt-3 text-xl font-bold text-[#14212e]">
          Niños no acompañados
        </h1>
        <p className="mt-1 text-sm text-[#5b6b7b]">
          Ficha completa de cada registro y actualización del historial de paradero y custodia.
          Públicamente solo se muestran el nombre y el historial.
        </p>

        {children.length === 0 ? (
          <p className="mt-6 text-sm text-slate-500">No hay registros.</p>
        ) : (
          <>
            {/* Búsqueda por nombre (preserva los demás filtros activos). */}
            <form action="/admin/ninos" className="mt-5">
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Buscar por nombre o apodo"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
              {edad && <input type="hidden" name="edad" value={edad} />}
              {reciente && <input type="hidden" name="reciente" value="1" />}
            </form>

            {/* Filtro por edad */}
            <div className="mt-4 mb-1 flex flex-wrap gap-2">
              <FilterChip
                href={buildHref({ edad: undefined })}
                active={!edad}
                label="Todas las edades"
                count={children.length}
              />
              {AGE_BUCKETS.map((b) => (
                <FilterChip
                  key={b.key}
                  href={buildHref({ edad: b.key })}
                  active={edad === b.key}
                  label={b.label}
                  count={children.filter(b.test).length}
                />
              ))}
            </div>

            {/* Filtro por paradero actualizado recientemente */}
            <div className="mb-1 flex flex-wrap gap-2">
              <FilterChip
                href={buildHref({ reciente: reciente ? undefined : "1" })}
                active={reciente}
                label="Paradero actualizado hace ≤7 días"
                count={children.filter(isRecent).length}
              />
            </div>

            <p className="mt-3 text-xs text-[#8190a0]">
              {filtered.length} de {children.length} registros
            </p>

            {filtered.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                Ningún registro coincide con los filtros.
              </p>
            ) : (
              <div className="mt-3 grid gap-3">
                {filtered.map((c) => (
                  <ChildAdminRow key={c.id} child={c} events={byChild.get(c.id) ?? []} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
