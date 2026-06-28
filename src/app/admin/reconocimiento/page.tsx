import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import FaceRecognition from "@/components/admin/FaceRecognition";
import { getAdminSession } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function ReconocimientoPage() {
  const session = await getAdminSession();
  if (!session?.isSuper) redirect("/admin"); // super-admin only

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-sm font-medium text-[#2563a8] hover:underline"
        >
          ← Volver al panel
        </Link>
        <h1 className="mt-3 text-xl font-bold text-[#14212e]">Reconocimiento facial</h1>
        <p className="mt-1 text-sm text-[#5b6b7b]">
          Buscar personas por rostro, depurar nuestra base de duplicados y
          conciliar identidades entre plataformas. Asistivo: siempre requiere
          verificación humana.
        </p>
        <div className="mt-5">
          <FaceRecognition />
        </div>
      </main>
    </>
  );
}
