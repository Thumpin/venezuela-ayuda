import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import PageShell from "@/components/PageShell";
import HelpOfferForm from "@/components/forms/HelpOfferForm";

export const metadata: Metadata = {
  title: "Puedo ayudar — Venezuela Ayuda",
  description: "Ofrece transporte, comida, refugio, atención médica, suministros o traducción.",
};

export default async function Page() {
  const t = await getTranslations("create");
  const tAbroad = await getTranslations("abroad");
  return (
    <PageShell
      emoji="🙌"
      title={t("canHelp.title")}
      intro={t("canHelp.intro")}
    >
      <Link
        href="/solicitudes"
        className="mb-4 inline-block font-semibold text-[#2563a8]"
      >
        {t("canHelp.seeRequests")}
      </Link>
      <HelpOfferForm />
      <p className="mt-6 text-sm text-[#5b6b7b]">
        <Link href="/postular-centro" className="font-semibold text-[#2563a8]">
          📦 {tAbroad("postularCta")} →
        </Link>
      </p>
    </PageShell>
  );
}
