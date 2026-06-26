import Link from "next/link";
import Header from "@/components/Header";
import AdminLogin from "@/components/admin/AdminLogin";
import DamagedAdminRow from "@/components/admin/DamagedAdminRow";
import ModerationRow from "@/components/admin/ModerationRow";
import CenterAdminRow from "@/components/admin/CenterAdminRow";
import {
  getAdminEmail,
  listDamagedReportsAdmin,
  listModerationItems,
  listCollectionCentersAdmin,
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

  const [damaged, mod, centers] = await Promise.all([
    listDamagedReportsAdmin(),
    listModerationItems(),
    listCollectionCentersAdmin(),
  ]);
  const pendingCenters = centers.filter((c) => !c.verified).length;

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

        <section className="mt-8">
          <h2 className="flex items-center gap-2 text-base font-semibold text-[#14212e]">
            Centros de acopio
            {pendingCenters > 0 && (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">
                {pendingCenters} pendiente{pendingCenters === 1 ? "" : "s"}
              </span>
            )}
          </h2>
          {centers.length === 0 ? (
            <p className="mt-3 text-sm text-[#8190a0]">No hay centros de acopio.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {centers.map((c) => (
                <CenterAdminRow item={c} key={c.id} />
              ))}
            </div>
          )}
        </section>

        <section className="mt-8">
          <h2 className="text-base font-semibold text-[#14212e]">
            Edificios dañados (comunidad)
          </h2>
          {damaged.length === 0 ? (
            <p className="mt-3 text-sm text-[#8190a0]">
              No hay reportes de edificios dañados.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {damaged.map((d) => (
                <DamagedAdminRow item={d} key={d.id} />
              ))}
            </div>
          )}
        </section>

        <section className="mt-8">
          <h2 className="text-base font-semibold text-[#14212e]">
            Moderación · reportes recientes
          </h2>
          {mod.length === 0 ? (
            <p className="mt-3 text-sm text-[#8190a0]">
              No hay reportes recientes.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {mod.map((m) => (
                <ModerationRow item={m} key={m.table + m.id} />
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
