import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import PartnerManager from "@/components/admin/PartnerManager";
import { getAdminSession, listPartners } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function ColaboradoresPage() {
  const session = await getAdminSession();
  if (!session?.isSuper) redirect("/admin"); // super-admin only

  const partners = await listPartners();

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-8">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-sm font-medium text-[#2563a8] hover:underline"
        >
          ← Volver al panel
        </Link>
        <h1 className="mt-3 text-xl font-bold text-[#14212e]">Colaboradores</h1>
        <p className="mt-1 text-sm text-[#5b6b7b]">
          Sitios que publican reportes en el hub vía la API. Cada uno recibe una
          key (se muestra una sola vez al crearla). Al revocar, la key puede
          seguir funcionando hasta ~1 minuto (cache de autenticación).
        </p>
        <div className="mt-5">
          <PartnerManager partners={partners} />
        </div>
      </main>
    </>
  );
}
