import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import ChildAdminRow from "@/components/admin/ChildAdminRow";
import {
  getAdminSession,
  listUnaccompaniedChildrenAdmin,
  listChildCustodyEvents,
  type AdminCustodyEventRow,
} from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function NinosAdminPage() {
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
          <div className="mt-5 grid gap-3">
            {children.map((c) => (
              <ChildAdminRow key={c.id} child={c} events={byChild.get(c.id) ?? []} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
