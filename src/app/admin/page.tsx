import Link from "next/link";
import Header from "@/components/Header";
import AdminLogin from "@/components/admin/AdminLogin";
import AdminTabs from "@/components/admin/AdminTabs";
import {
  getAdminEmail,
  listDamagedReportsAdmin,
  listModerationItems,
  listCollectionCentersAdmin,
  listHospitalizedAdmin,
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

  const [damaged, mod, centers, hospitalized] = await Promise.all([
    listDamagedReportsAdmin(),
    listModerationItems(),
    listCollectionCentersAdmin(),
    listHospitalizedAdmin(),
  ]);

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e6ecf2] bg-white p-4">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-[#14212e]">
              🛡️ Panel de administración
            </h1>
            <p className="mt-0.5 truncate text-sm text-[#5b6b7b]">{email}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/colaboradores"
              className="rounded-lg border border-[#e6ecf2] px-3 py-2 text-sm font-medium text-[#14212e] transition hover:bg-slate-50"
            >
              Colaboradores
            </Link>
            <Link
              href="/admin/admins"
              className="rounded-lg border border-[#e6ecf2] px-3 py-2 text-sm font-medium text-[#14212e] transition hover:bg-slate-50"
            >
              Administradores
            </Link>
            <Link
              href="/admin/duplicados"
              className="rounded-lg border border-[#e6ecf2] px-3 py-2 text-sm font-medium text-[#14212e] transition hover:bg-slate-50"
            >
              Duplicados
            </Link>
            <form action={adminSignOut}>
              <button
                type="submit"
                className="rounded-lg border border-[#e6ecf2] px-3 py-2 text-sm font-medium text-[#5b6b7b] transition hover:bg-slate-50"
              >
                Cerrar sesión
              </button>
            </form>
          </div>
        </div>

        <AdminTabs centers={centers} damaged={damaged} mod={mod} hospitalized={hospitalized} />
      </main>
    </>
  );
}
