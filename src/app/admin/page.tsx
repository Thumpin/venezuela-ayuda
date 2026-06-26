import Link from "next/link";
import Header from "@/components/Header";
import AdminLogin from "@/components/admin/AdminLogin";
import AdminDashboard from "@/components/admin/AdminDashboard";
import {
  getAdminEmail,
  listDamagedReportsAdmin,
  listMergeCandidates,
  listReviewedCandidates,
  listModerationItems,
} from "@/lib/admin";
import { adminSignOut } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
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

  const [damaged, mod, pending, reviewed] = await Promise.all([
    listDamagedReportsAdmin(),
    listModerationItems(),
    listMergeCandidates(50, email),
    listReviewedCandidates(100),
  ]);

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
        {/* Top bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e6ecf2] bg-white p-4">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-[#14212e]">Panel de administración</h1>
            <p className="mt-0.5 truncate text-sm text-[#5b6b7b]">{email}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin/duplicados"
              className="rounded-lg border border-[#e6ecf2] bg-amber-50 px-3 py-2 text-sm font-medium text-[#14212e] transition hover:bg-amber-100">
              Duplicados
            </Link>
            <Link href="/admin/admins"
              className="rounded-lg border border-[#e6ecf2] px-3 py-2 text-sm font-medium text-[#14212e] transition hover:bg-slate-50">
              Administradores
            </Link>
            <form action={adminSignOut}>
              <button type="submit"
                className="rounded-lg border border-[#e6ecf2] px-3 py-2 text-sm font-medium text-[#5b6b7b] transition hover:bg-slate-50">
                Cerrar sesión
              </button>
            </form>
          </div>
        </div>

        {/* Summary cards */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/admin/duplicados"
            className="group rounded-2xl border border-[#e6ecf2] bg-white p-4 transition hover:border-[#8190a0] hover:shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
                <span className="text-lg">🔁</span>
              </div>
              <div>
                <p className="text-2xl font-bold text-[#14212e]">{pending.length}</p>
                <p className="text-xs text-[#8190a0]">Duplicados pendientes</p>
              </div>
            </div>
          </Link>
          <Link href="/admin/duplicados/revisados"
            className="group rounded-2xl border border-[#e6ecf2] bg-white p-4 transition hover:border-[#8190a0] hover:shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
                <span className="text-lg">✓</span>
              </div>
              <div>
                <p className="text-2xl font-bold text-[#14212e]">{reviewed.length}</p>
                <p className="text-xs text-[#8190a0]">Decisiones tomadas</p>
              </div>
            </div>
          </Link>
          <div className="rounded-2xl border border-[#e6ecf2] bg-white p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50">
                <span className="text-lg">🏚️</span>
              </div>
              <div>
                <p className="text-2xl font-bold text-[#14212e]">{damaged.length}</p>
                <p className="text-xs text-[#8190a0]">Edificios dañados</p>
              </div>
            </div>
          </div>
          <Link href="/admin/admins"
            className="group rounded-2xl border border-[#e6ecf2] bg-white p-4 transition hover:border-[#8190a0] hover:shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
                <span className="text-lg">👤</span>
              </div>
              <div>
                <p className="text-2xl font-bold text-[#14212e]">{mod.length}</p>
                <p className="text-xs text-[#8190a0]">Pendientes moderación</p>
              </div>
            </div>
          </Link>
        </div>

        {/* Master-detail dashboard */}
        <div className="mt-6">
          <AdminDashboard pending={pending} reviewed={reviewed} damaged={damaged} mod={mod} />
        </div>
      </main>
    </>
  );
}
