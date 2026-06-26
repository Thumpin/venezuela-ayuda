import Link from "next/link";
import Header from "@/components/Header";
import AdminLogin from "@/components/admin/AdminLogin";
import MergeCandidateRow from "@/components/admin/MergeCandidateRow";
import { getAdminEmail, listMergeCandidates } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function DuplicadosPage() {
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

  const candidates = await listMergeCandidates(50);

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e6ecf2] bg-white p-4">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-[#14212e]">🔁 Revisar duplicados</h1>
            <p className="mt-0.5 text-sm text-[#5b6b7b]">
              Posibles personas repetidas. Decide cuáles son la misma.
            </p>
          </div>
          <Link
            href="/admin"
            className="rounded-lg border border-[#e6ecf2] px-3 py-2 text-sm font-medium text-[#14212e] transition hover:bg-slate-50"
          >
            ← Panel
          </Link>
        </div>

        {candidates.length === 0 ? (
          <p className="mt-8 text-sm text-[#8190a0]">
            No hay duplicados pendientes de revisar. Corre el motor de dedup para
            generar candidatos (<code>select run_dedup_engine();</code>).
          </p>
        ) : (
          <>
            <p className="mt-6 text-sm text-[#5b6b7b]">
              {candidates.length} par(es) por revisar — ordenados por probabilidad.
              Al marcar un duplicado, el registro B se oculta (no se borra).
            </p>
            <div className="mt-3 space-y-4">
              {candidates.map((c) => (
                <MergeCandidateRow item={c} key={c.id} />
              ))}
            </div>
          </>
        )}
      </main>
    </>
  );
}
