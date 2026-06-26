import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import PageShell from "@/components/PageShell";
import CollectionCenterForm from "@/components/forms/CollectionCenterForm";

export const metadata: Metadata = {
  title: "Postular un centro de acopio — Venezuela Ayuda",
  description:
    "Registra un centro de acopio para la respuesta al terremoto en Venezuela. Lo revisamos antes de publicarlo.",
};

export default async function Page() {
  const t = await getTranslations("forms.center");
  return (
    <PageShell emoji="📦" title={t("pageTitle")} intro={t("pageIntro")}>
      <CollectionCenterForm />
    </PageShell>
  );
}
