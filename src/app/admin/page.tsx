import Link from "next/link";
import Header from "@/components/Header";
import AdminLogin from "@/components/admin/AdminLogin";
import DamagedAdminRow from "@/components/admin/DamagedAdminRow";
import ModerationRow from "@/components/admin/ModerationRow";
import {
  getAdminEmail,
  listDamagedReportsAdmin,
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

  const [damaged, mod] = await Promise.all([
    listDamagedReportsAdmin(),
    listModerationItems(),
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
              href="/admin/duplicados"
              className="rounded-lg border border-[#e6ecf2] px-3 py-2 text-sm font-medium text-[#14212e] transition hover:bg-slate-50"
            >
              Duplicados
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
