import Link from "next/link";
import Header from "@/components/Header";
import AdminLogin from "@/components/admin/AdminLogin";
import MergeTabs from "@/components/admin/MergeTabs";
import ReviewedCandidateRow from "@/components/admin/ReviewedCandidateRow";
import { getAdminEmail, listReviewedCandidates } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function RevisadosPage() {
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

  const reviewed = await listReviewedCandidates(100);

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e6ecf2] bg-white p-4">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-[#14212e]">🔁 Revisar duplicados</h1>
            <p className="mt-0.5 text-sm text-[#5b6b7b]">Historial de decisiones ya tomadas.</p>
          </div>
          <Link href="/admin" className="rounded-lg border border-[#e6ecf2] px-3 py-2 text-sm font-medium text-[#14212e] transition hover:bg-slate-50">← Panel</Link>
        </div>

        <div className="mt-5">
          <MergeTabs active="revisados" />
        </div>

        {reviewed.length === 0 ? (
          <p className="mt-8 text-sm text-[#8190a0]">
            No hay decisiones registradas. Aparecerán aquí a medida que revises duplicados.
          </p>
        ) : (
          <div className="mt-5 space-y-3">
            {reviewed.map((c) => (
              <ReviewedCandidateRow item={c} key={c.id} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
