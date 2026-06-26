import Link from "next/link";
import Header from "@/components/Header";
import AdminLogin from "@/components/admin/AdminLogin";
import MergeClusterCard from "@/components/admin/MergeClusterCard";
import { countDeferredCandidates, getAdminEmail, listMergeClusters } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function DuplicadosPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const email = await getAdminEmail();

  if (!email) {
    return (
      <>
        <Header />
        <main className="mx-auto w-full max-w-md flex-1 px-4 py-10">
          <AdminLogin />
        </main>
      </>
    );
  }

  const { estado } = await searchParams;
  const deferred = estado === "dudosos";

  const [clusters, deferredCount] = await Promise.all([
    listMergeClusters(deferred ? "DEFERRED" : "PENDING"),
    countDeferredCandidates(),
  ]);

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e6ecf2] bg-white p-4">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-[#14212e]">
              {deferred ? "🤔 Duplicados dudosos" : "🔁 Revisar duplicados"}
            </h1>
            <p className="mt-0.5 text-sm text-[#5b6b7b]">
              {deferred
                ? "Bloques que apartaste para revisar con más calma."
                : "Bloques de posibles personas repetidas. Decide cuáles son la misma."}
            </p>
          </div>
          <Link
            href="/admin"
            className="rounded-lg border border-[#e6ecf2] px-3 py-2 text-sm font-medium text-[#14212e] transition hover:bg-slate-50"
          >
            ← Panel
          </Link>
        </div>

        {/* Lane switcher: main queue ↔ "dudosos". */}
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <Link
            href="/admin/duplicados"
            className={`rounded-lg px-3 py-1.5 font-medium transition ${
              deferred
                ? "border border-[#e6ecf2] text-[#14212e] hover:bg-slate-50"
                : "bg-[#14212e] text-white"
            }`}
          >
            Por revisar
          </Link>
          <Link
            href="/admin/duplicados?estado=dudosos"
            className={`rounded-lg px-3 py-1.5 font-medium transition ${
              deferred
                ? "bg-[#14212e] text-white"
                : "border border-[#e6ecf2] text-[#14212e] hover:bg-slate-50"
            }`}
          >
            Dudosos{deferredCount > 0 ? ` (${deferredCount})` : ""}
          </Link>
        </div>

        {clusters.length === 0 ? (
          <p className="mt-8 text-sm text-[#8190a0]">
            {deferred ? (
              "No hay bloques apartados. Los que marques como “no estoy seguro” aparecerán aquí."
            ) : (
              <>
                No hay duplicados pendientes de revisar. Corre el motor de dedup para
                generar candidatos (<code>select run_dedup_engine();</code>).
              </>
            )}
          </p>
        ) : (
          <>
            <p className="mt-6 text-sm text-[#5b6b7b]">
              {deferred ? (
                <>
                  {clusters.length} bloque(s) apartado(s). Decídelos o devuélvelos a
                  la cola.
                </>
              ) : (
                <>
                  {clusters.length} bloque(s) por revisar — ordenados por
                  probabilidad. Conserva un registro por bloque; los marcados como
                  duplicados se ocultan (no se borran).
                </>
              )}
            </p>
            <div className="mt-3 space-y-4">
              {clusters.map((c) => (
                <MergeClusterCard cluster={c} key={c.id} deferred={deferred} />
              ))}
            </div>
          </>
        )}
      </main>
    </>
  );
}
