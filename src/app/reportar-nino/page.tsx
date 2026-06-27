import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import PageShell from "@/components/PageShell";
import FoundChildForm from "@/components/forms/FoundChildForm";

export const metadata: Metadata = {
  title: "Registrar un niño/a encontrado/a — Venezuela Ayuda",
  description: "Registra a un niño o niña encontrado solo para no perderle el rastro.",
};

export default async function Page() {
  const t = await getTranslations("children.report");
  return (
    <PageShell emoji="👶" title={t("title")} intro={t("intro")}>
      <FoundChildForm />
    </PageShell>
  );
}
