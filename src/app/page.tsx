import Link from "next/link";
import Header from "@/components/Header";
import BigButton from "@/components/BigButton";
import DonateButton from "@/components/DonateButton";
import MapView from "@/components/MapView";
import EmergencyPhones from "@/components/EmergencyPhones";
import SupportMeasures from "@/components/SupportMeasures";
import DigitelMeasure from "@/components/DigitelMeasure";
import IngenieriaSolidariaMeasure from "@/components/IngenieriaSolidariaMeasure";
import SismoAyudaMeasure from "@/components/SismoAyudaMeasure";
import CvcEmergenciaMeasure from "@/components/CvcEmergenciaMeasure";
import SeismicAlerts from "@/components/SeismicAlerts";
import { getStats, getMapMarkers } from "@/lib/data";
import { getTranslations, getLocale } from "next-intl/server";

export const revalidate = 60;

export default async function Home() {
  const [stats, markers] = await Promise.all([getStats(), getMapMarkers()]);
  const t = await getTranslations("home");
  const tAlerts = await getTranslations("alerts");
  const locale = await getLocale();
  const fmt = (n: number) => n.toLocaleString(locale === "en" ? "en-US" : "es-VE");

  return (
    <>
      <Header />
      <main id="contenido" className="mx-auto w-full max-w-6xl flex-1 px-4 py-7">
        {/* Hero (full width, above the two columns) */}
        <section>
          <h1 className="text-[26px] font-extrabold uppercase leading-tight tracking-tight text-[#14212e] sm:text-[34px]">
            {t("heroTitle")}
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-[#5b6b7b] sm:text-lg">
            {t("heroSubtitle")}
          </p>
        </section>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {/* Actions column */}
          <div>
        {/* Primary actions */}
        <section className="grid gap-3" aria-label="Acciones principales">
          <DonateButton />
          <BigButton
            href="/buscar"
            emoji="🔎"
            label={t("actions.searchLabel")}
            sublabel={t("actions.searchSub")}
            tileBg="#eef3fa"
          />
          <BigButton
            href="/buscar?tipo=desaparecidos"
            emoji="👤"
            label="Lista de Desaparecidos"
            sublabel="Ver listado de personas buscadas y reportadas desaparecidas"
            tileBg="#fef3c7"
          />
          <BigButton
            href="/buscar?tipo=hospitalizados"
            emoji="🏥"
            label="Lista de Hospitalizados"
            sublabel="Ver listado de personas registradas en hospitales y centros de salud"
            tileBg="#d1fae5"
          />
          <BigButton
            href="/necesito-ayuda"
            emoji="🆘"
            label={t("actions.needHelpLabel")}
            sublabel={t("actions.needHelpSub")}
            tileBg="#fdf0e9"
            accent
          />
          <BigButton
            href="/reportar-edificio"
            emoji="🏚️"
            label={t("actions.reportBuildingLabel")}
            sublabel={t("actions.reportBuildingSub")}
            tileBg="#f6dada"
          />
          <BigButton
            href="/a-salvo"
            emoji="✅"
            label={t("actions.safeLabel")}
            sublabel={t("actions.safeSub")}
            tileBg="#eaf3ec"
          />
          <BigButton
            href="/puedo-ayudar"
            emoji="🤝"
            label={t("actions.canHelpLabel")}
            sublabel={t("actions.canHelpSub")}
            tileBg="#e9f6ef"
          />
          <BigButton
            href="/ayudar-fuera"
            emoji="🌍"
            label={t("actions.helpOutsideLabel")}
            sublabel={t("actions.helpOutsideSub")}
            tileBg="#eef3fa"
          />
          <BigButton
            href="/mapa"
            emoji="🗺️"
            label={t("actions.viewMapLabel")}
            sublabel={t("actions.viewMapSub")}
            tileBg="#eef3fa"
          />
        </section>

        {/* Live stats */}
        <section className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3" aria-label="Estadísticas">
          <Stat emoji="✅" value={fmt(stats.safe)} label={t("stats.safe")} color="#2f9e6e" />
          <Stat emoji="🔎" value={fmt(stats.missing)} label={t("stats.missing")} color="#b5811f" />
          <Stat emoji="💚" value={fmt(stats.found)} label={t("stats.found")} color="#1f7a52" />
          <Stat emoji="🆘" value={fmt(stats.requests)} label={t("stats.requests")} color="#e2603a" />
          <Stat emoji="🤝" value={fmt(stats.helpers)} label={t("stats.helpers")} color="#2563a8" />
          <Stat emoji="🏚️" value={fmt(stats.damaged)} label={t("stats.damaged")} color="#7f1d1d" />
        </section>

        <div className="mt-5">
          <EmergencyPhones />
        </div>
          </div>

          {/* Map column */}
          <div className="md:sticky md:top-6 md:self-start">
            <div className="overflow-hidden rounded-2xl border border-[#e6ecf2] bg-white">
              <div className="flex items-center justify-between gap-2 border-b border-[#e6ecf2] px-4 py-3">
                <span className="text-sm font-semibold text-[#14212e]">🗺️ {t("mapTitle")}</span>
                <Link href="/mapa" className="text-sm font-semibold text-[#2563a8]">
                  {t("mapViewFull")}
                </Link>
              </div>
              <MapView
                markers={markers}
                heightClass="h-[55vh] min-h-[380px] md:h-[calc(100dvh-260px)] md:max-h-[640px]"
                initialZoom={5}
              />
            </div>
          </div>
        </div>

        {/* Support measures + earthquake-alert how-to, side by side */}
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <section aria-label={t("measuresTitle")}>
            <h2 className="mb-3 text-lg font-bold text-[#14212e]">{t("measuresTitle")}</h2>
            <div className="grid gap-4">
              <SupportMeasures />
              <DigitelMeasure />
              <IngenieriaSolidariaMeasure />
              <SismoAyudaMeasure />
              <CvcEmergenciaMeasure />
            </div>
          </section>
          <section aria-label={tAlerts("title")}>
            <h2 className="mb-3 text-lg font-bold text-[#14212e]">📳 {tAlerts("title")}</h2>
            <SeismicAlerts />
          </section>
        </div>
      </main>

      <section
        aria-label="Fuentes de información"
        className="mx-auto w-full max-w-5xl px-4 pt-2"
      >
        <div className="rounded-2xl border border-[#e6ecf2] bg-white p-4 text-center text-xs leading-relaxed text-[#8190a0]">
          <span className="font-semibold text-[#5b6b7b]">{t("sourcesLabel")}</span>{" "}
          {[
            ["https://terremotovenezuela2026.vercel.app", "terremotovenezuela2026"],
            ["https://desaparecidosterremotovenezuela.com", "desaparecidosterremotovenezuela.com"],
            ["https://terremotovenezuela.com", "terremotovenezuela.com"],
            ["https://venezuelatebusca.com", "venezuelatebusca.com"],
            ["https://terremotovenezuela.app", "terremotovenezuela.app"],
            ["https://terremotove.netlify.app", "terremotove"],
          ].map(([url, name], i, arr) => (
            <span key={url}>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#2563a8] hover:underline"
              >
                {name}
              </a>
              {i < arr.length - 1 ? " · " : ""}
            </span>
          ))}
        </div>
      </section>

      <footer className="mx-auto w-full max-w-5xl px-4 py-8 text-center text-sm text-[#8190a0]">
        <div className="text-left">
          <div className="rounded-2xl border border-[#e6ecf2] bg-white p-5 text-[#5b6b7b]">
            <p className="font-semibold text-[#14212e]">{t("footer.contributeTitle")}</p>
            <p className="mt-1">
              {t.rich("footer.contributeBody", {
                email: (chunks) => (
                  <a href="mailto:hola@maw.dev" className="font-semibold text-[#2563a8] underline">
                    {chunks}
                  </a>
                ),
              })}
            </p>
            <p className="mt-3 font-medium text-[#14212e]">{t("footer.madeWith")}</p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.webp"
            alt="Hazlo Hoy · Venezuela Ayuda"
            className="h-10 w-10 rounded-xl"
          />
          <a
            href="https://maw.dev"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="maw.dev"
            className="shrink-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/maw-dev.webp" alt="maw.dev" className="h-9 w-9 rounded-lg" />
          </a>
          <a
            href="https://github.com/mawmawmaw/venezuela-ayuda"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            className="shrink-0 text-[#5b6b7b] transition hover:text-[#14212e]"
          >
            <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor" aria-hidden>
              <path d="M12 .5C5.37.5 0 5.78 0 12.29c0 5.2 3.44 9.6 8.21 11.16.6.11.82-.25.82-.56 0-.28-.01-1.02-.02-2-3.34.71-4.04-1.58-4.04-1.58-.55-1.37-1.34-1.74-1.34-1.74-1.09-.73.08-.72.08-.72 1.2.08 1.84 1.21 1.84 1.21 1.07 1.8 2.81 1.28 3.5.98.11-.76.42-1.28.76-1.57-2.67-.3-5.47-1.31-5.47-5.83 0-1.29.47-2.34 1.24-3.17-.12-.3-.54-1.52.12-3.17 0 0 1.01-.32 3.3 1.21a11.5 11.5 0 0 1 6 0c2.29-1.53 3.3-1.21 3.3-1.21.66 1.65.24 2.87.12 3.17.77.83 1.24 1.88 1.24 3.17 0 4.53-2.81 5.53-5.49 5.82.43.37.81 1.1.81 2.22 0 1.61-.01 2.9-.01 3.29 0 .31.21.68.83.56A12.01 12.01 0 0 0 24 12.29C24 5.78 18.63.5 12 .5z" />
            </svg>
          </a>
        </div>

        <p className="mt-3">{t("footer.tagline")}</p>
        <p className="mt-1 text-xs">{t("footer.noAffiliation")}</p>
      </footer>
    </>
  );
}

function Stat({
  value,
  label,
  color,
  emoji,
}: {
  value: string;
  label: string;
  color: string;
  emoji: string;
}) {
  return (
    <div className="rounded-[14px] border border-[#e6ecf2] bg-white px-2.5 py-3 text-center">
      <div aria-hidden className="text-base leading-none">
        {emoji}
      </div>
      <div className="mt-1 text-2xl font-bold leading-none" style={{ color }}>
        {value}
      </div>
      <div className="mt-1 text-[11px] font-medium leading-tight text-[#5b6b7b]">{label}</div>
    </div>
  );
}
