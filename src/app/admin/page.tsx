import Link from "next/link";
import Header from "@/components/Header";
import AdminLogin from "@/components/admin/AdminLogin";
import AdminTabs from "@/components/admin/AdminTabs";
import {
  getAdminSession,
  listDamagedReportsAdmin,
  listModerationItems,
  listCollectionCentersAdmin,
  listHospitalizedAdmin,
} from "@/lib/admin";
import { adminSignOut } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getAdminSession();

  if (!session) {
    return (
      <>
        <Header />
        <main className="mx-auto w-full max-w-md flex-1 px-4 py-10">
          <AdminLogin />
        </main>
      </>
    );
  }

  const { email, isSuper } = session;
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
            <p className="mt-0.5 flex items-center gap-2 truncate text-sm text-[#5b6b7b]">
              {email}
              {isSuper && (
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-700">
                  super-admin
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/duplicados"
              className="rounded-lg border border-[#e6ecf2] px-3 py-2 text-sm font-medium text-[#14212e] transition hover:bg-slate-50"
            >
              Duplicados
            </Link>
            {isSuper && (
              <>
                <Link
                  href="/admin/reconocimiento"
                  className="rounded-lg border border-[#e6ecf2] px-3 py-2 text-sm font-medium text-[#14212e] transition hover:bg-slate-50"
                >
                  Reconocimiento
                </Link>
                <Link
                  href="/admin/ingesta"
                  className="rounded-lg border border-[#e6ecf2] px-3 py-2 text-sm font-medium text-[#14212e] transition hover:bg-slate-50"
                >
                  Ingesta
                </Link>
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
              </>
            )}
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

