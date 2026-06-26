import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import PageShell from "@/components/PageShell";
import HelpAbroadList from "@/components/HelpAbroadList";
import { getAbroadCenters } from "@/lib/data";

export const metadata: Metadata = {
  title: "Quiero ayudar fuera de Venezuela — Venezuela Ayuda",
  description:
    "Encuentra en tu ciudad lugares donde puedes ayudar: voluntariado y centros de acopio para la respuesta al terremoto en Venezuela.",
};

export const revalidate = 60;

export default async function Page() {
  const t = await getTranslations("abroad");
  const cities = await getAbroadCenters();
  return (
    <PageShell wide emoji="🌍" title={t("title")} intro={t("intro")}>
      <HelpAbroadList cities={cities} />
      <div className="mt-6 rounded-2xl border border-[#e6ecf2] bg-white p-4 text-sm text-[#5b6b7b]">
        <p>{t("postularPrompt")}</p>
        <Link
          href="/postular-centro"
          className="mt-2 inline-block font-semibold text-[#2563a8]"
        >
          {t("postularCta")} →
        </Link>
      </div>
    </PageShell>
  );
}
