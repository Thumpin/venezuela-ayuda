import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Header from "@/components/Header";
import { getFoundChildPublic } from "@/lib/data";
import { fullDate, timeAgo } from "@/lib/format";

export const revalidate = 30;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const c = await getFoundChildPublic(id);
  // Por protección infantil, el título solo lleva el nombre.
  return { title: c ? `${c.name} — Venezuela Ayuda` : "Registro no encontrado — Venezuela Ayuda" };
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ nuevo?: string }>;
}) {
  const { id } = await params;
  const { nuevo } = await searchParams;

  const pub = await getFoundChildPublic(id);
  if (!pub) notFound();

  const t = await getTranslations("children.detail");

  // Superficie pública = SOLO el nombre. El historial de paradero/custodia y la
  // ficha completa viven únicamente en el panel de admin (super admin).
  return (
    <>
      <Header />
      <main id="contenido" className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
        <Link
          href="/ninos"
          className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800"
        >
          {t("back")}
        </Link>

        {nuevo === "1" && (
          <p className="mt-3 rounded-xl bg-green-50 px-4 py-3 font-medium text-green-800">
            {t("createdOk")}
          </p>
        )}

        <article className="mt-4 rounded-2xl bg-white p-6 ring-1 ring-black/5">
          <h1 className="text-3xl font-extrabold text-slate-900">👶 {pub.name}</h1>
          <p className="mt-4 rounded-xl bg-[#eef3fa] px-4 py-3 text-sm text-[#3c5573]">
            {t("publicNotice")}
          </p>
          <p className="mt-4 text-sm text-slate-400" title={fullDate(pub.created_at)}>
            {timeAgo(pub.created_at)}
          </p>
        </article>
      </main>
    </>
  );
}
