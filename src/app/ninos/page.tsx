import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import PageShell from "@/components/PageShell";
import { searchFoundChildren } from "@/lib/data";
import { timeAgo } from "@/lib/format";

export const revalidate = 30;

export const metadata: Metadata = {
  title: "Niños y niñas registrados — Venezuela Ayuda",
  description: "Nombres de niños y niñas registrados al ser encontrados solos.",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const t = await getTranslations("children.list");
  const children = await searchFoundChildren({ q: q?.trim() || undefined, limit: 200 });

  return (
    <PageShell emoji="👶" title={t("title")} intro={t("intro")}>
      <p className="rounded-xl bg-[#eef3fa] px-4 py-3 text-sm text-[#3c5573]">
        {t("privacyNote")}
      </p>

      <Link
        href="/reportar-nino"
        className="mt-4 block rounded-xl bg-[#2563a8] px-5 py-3.5 text-center font-bold text-white"
      >
        {t("cta")}
      </Link>

      <form action="/ninos" className="mt-4 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder={t("searchPlaceholder")}
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
        />
      </form>

      {children.length === 0 ? (
        <p className="mt-6 text-center text-slate-500">{t("empty")}</p>
      ) : (
        <ul className="mt-4 grid gap-2">
          {children.map((c) => (
            <li key={c.id}>
              <Link
                href={`/nino/${c.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 hover:border-[#2563a8]"
              >
                <span className="font-semibold text-slate-900">👶 {c.name}</span>
                <span className="shrink-0 text-xs text-slate-400">
                  {t("registeredAgo", { ago: timeAgo(c.created_at) })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
