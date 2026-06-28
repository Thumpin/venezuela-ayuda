import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import Header from "@/components/Header";
import { getMissingWithPhotos } from "@/lib/data";
import { signedPhotoUrls } from "@/lib/storage";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Reconocer personas — Venezuela Ayuda",
  description:
    "Fotos de personas reportadas como desaparecidas. Si reconoces a alguien, ayúdanos a reconectarla con su familia.",
};

const PAGE_SIZE = 60;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ciudad?: string; page?: string }>;
}) {
  const t = await getTranslations("gallery");
  const sp = await searchParams;
  const ciudad = sp.ciudad?.trim() || undefined;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const people = await getMissingWithPhotos({
    city: ciudad,
    limit: PAGE_SIZE,
    offset,
  });

  const photoUrls = await signedPhotoUrls(people.map((p) => p.photo_url));

  // Build a querystring that preserves the active city filter.
  const qs = (targetPage: number) => {
    const params = new URLSearchParams();
    if (ciudad) params.set("ciudad", ciudad);
    if (targetPage > 1) params.set("page", String(targetPage));
    const s = params.toString();
    return s ? `?${s}` : "";
  };

  return (
    <>
      <Header />
      <main id="contenido" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800"
        >
          {t("backHome")}
        </Link>

        <h1 className="mt-3 text-2xl font-extrabold text-slate-900">
          {t("heading")}
        </h1>
        <p className="mt-1 text-[#5b6b7b]">{t("intro")}</p>

        <form method="get" className="mt-4 flex gap-2" role="search">
          <input
            name="ciudad"
            defaultValue={ciudad ?? ""}
            placeholder={t("filterPlaceholder")}
            aria-label={t("filterLabel")}
            maxLength={80}
            className="min-w-0 flex-1 rounded-xl border border-[#e6ecf2] bg-white px-4 py-2.5 text-base"
          />
          <button
            type="submit"
            className="shrink-0 rounded-xl bg-[#2563a8] px-5 py-2.5 font-semibold text-white active:scale-[0.99]"
          >
            {t("filterSubmit")}
          </button>
        </form>

        {people.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-[#e6ecf2] bg-white p-6 text-center text-[#5b6b7b]">
            <p className="font-semibold text-[#14212e]">
              {ciudad ? t("emptyWithFilter") : t("empty")}
            </p>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {people.map((p, i) => (
              <Link
                key={p.id}
                href={`/persona/${p.id}`}
                className="block"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoUrls[i] ?? undefined}
                  alt=""
                  className="aspect-square w-full rounded-xl object-cover"
                />
                <p className="mt-1.5 text-sm font-semibold text-[#14212e]">
                  {p.name.split(" ")[0]}
                </p>
                <p className="truncate text-xs text-[#8190a0]">
                  {p.place_name || p.city}
                </p>
              </Link>
            ))}
          </div>
        )}

        <nav className="mt-6 flex items-center justify-between">
          {page > 1 ? (
            <Link
              href={`/galeria${qs(page - 1)}`}
              className="text-sm font-semibold text-[#2563a8]"
            >
              {t("previous")}
            </Link>
          ) : (
            <span />
          )}
          {people.length === PAGE_SIZE ? (
            <Link
              href={`/galeria${qs(page + 1)}`}
              className="text-sm font-semibold text-[#2563a8]"
            >
              {t("next")}
            </Link>
          ) : (
            <span />
          )}
        </nav>

        <p className="mt-8 text-center text-xs text-[#8190a0]">
          {t("footer")}
        </p>
      </main>
    </>
  );
}
