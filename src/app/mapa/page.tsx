import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import Header from "@/components/Header";
import MapView from "@/components/MapView";
import SourcesNote from "@/components/SourcesNote";
import { getMapMarkers } from "@/lib/data";

export const metadata: Metadata = {
  title: "Mapa de ayuda — Venezuela Ayuda",
  description:
    "Mapa interactivo: personas a salvo, solicitudes de ayuda urgentes y voluntarios disponibles.",
};

// Map data changes constantly during an emergency.
export const revalidate = 20;

export default async function Page() {
  const markers = await getMapMarkers();
  const t = await getTranslations("map");
  const tCommon = await getTranslations("common");

  return (
    <>
      <Header />
      <main id="contenido" className="flex-1">
        <div className="mx-auto max-w-5xl px-4 pt-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800"
          >
            {tCommon("backHome")}
          </Link>
        </div>
        <div className="mx-auto mt-2 flex max-w-5xl items-center justify-between gap-3 px-4">
          <h1 className="text-2xl font-extrabold text-slate-900">{t("title")}</h1>
          <div className="flex items-center gap-2">
            <Link
              href="/solicitudes"
              className="rounded-xl bg-[#2563a8] px-4 py-2.5 text-sm font-bold text-white"
            >
              {t("wantToHelp")}
            </Link>
            <Link
              href="/necesito-ayuda"
              className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white"
            >
              {t("askForHelp")}
            </Link>
          </div>
        </div>

        <div className="mx-auto mt-2 max-w-5xl">
          <MapView markers={markers} locationFirst />
        </div>

        <div className="mx-auto max-w-5xl px-4 py-4">
          <p className="text-center text-sm text-slate-500">
            {t("hint")}
          </p>
          <SourcesNote />
        </div>
      </main>
    </>
  );
}
