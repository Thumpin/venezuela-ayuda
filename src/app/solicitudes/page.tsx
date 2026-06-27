import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import Header from "@/components/Header";
import GuideInvitePopup from "@/components/GuideInvitePopup";
import SourceBadge from "@/components/SourceBadge";
import UseMyLocationButton from "@/components/UseMyLocationButton";
import { getMatchingRequests } from "@/lib/data";
import { formatItems } from "@/lib/validation";
import {
  HELP_CATEGORIES,
  OFFER_CATEGORIES,
  OFFER_TO_HELP,
  URGENCY_LEVELS,
  type HelpCategory,
  type OfferCategory,
} from "@/lib/constants";

export const revalidate = 30;

export const metadata: Metadata = {
  title: "Solicitudes de ayuda — Venezuela Ayuda",
  description:
    "Personas que necesitan ayuda. Encuentra una que puedas atender cerca de ti.",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    desde?: string;
    cat?: string;
    lat?: string;
    lng?: string;
    ciudad?: string;
    categoria?: string;
    estado?: string;
  }>;
}) {
  const sp = await searchParams;
  const cat = sp.cat;
  const categoria = sp.categoria;
  const ciudad = sp.ciudad?.trim() || undefined;
  const estado =
    sp.estado === "OPEN" || sp.estado === "IN_PROGRESS" ? sp.estado : undefined;

  // Resolve which help-request categories to show.
  let categories: HelpCategory[] | undefined;
  if (cat && cat in OFFER_CATEGORIES) {
    categories = OFFER_TO_HELP[cat as OfferCategory];
  } else if (categoria && categoria in HELP_CATEGORIES) {
    categories = [categoria as HelpCategory];
  } else {
    categories = undefined;
  }

  const latNum = sp.lat != null ? Number(sp.lat) : NaN;
  const lngNum = sp.lng != null ? Number(sp.lng) : NaN;
  const lat = Number.isNaN(latNum) ? undefined : latNum;
  const lng = Number.isNaN(lngNum) ? undefined : lngNum;

  const requests = await getMatchingRequests({
    categories: categories?.length ? categories : undefined,
    lat,
    lng,
    city: ciudad,
    status: estado,
    limit: 60,
  });

  // Preserve the active filters when switching the status chip.
  const statusHref = (value?: "OPEN" | "IN_PROGRESS") => {
    const p = new URLSearchParams();
    if (categoria) p.set("categoria", categoria);
    if (cat) p.set("cat", cat);
    if (ciudad) p.set("ciudad", ciudad);
    if (sp.lat != null) p.set("lat", sp.lat);
    if (sp.lng != null) p.set("lng", sp.lng);
    if (value) p.set("estado", value);
    const qs = p.toString();
    return qs ? `/solicitudes?${qs}` : "/solicitudes";
  };

  const tr = await getTranslations("detail");
  const tD = await getTranslations("domain");
  const tc = await getTranslations("common");

  const fromOffer = sp.desde === "oferta";
  const offerKey = cat && cat in OFFER_CATEGORIES ? (cat as OfferCategory) : null;

  const h1 = fromOffer
    ? tr("requests.thanksTitle")
    : tr("requests.activeTitle");
  const intro = fromOffer
    ? `${tr("requests.introFromOffer")}${
        offerKey
          ? tr("requests.introFromOfferCovering", {
              offer: tD(`offer.${offerKey}`).toLowerCase(),
            })
          : ""
      }`
    : tr("requests.intro");

  return (
    <>
      <Header />
      <main
        id="contenido"
        className="mx-auto w-full max-w-2xl flex-1 px-4 py-6"
      >
        {fromOffer && <GuideInvitePopup />}
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800"
        >
          {tc("backHome")}
        </Link>

        <h1 className="mt-3 text-2xl font-extrabold text-slate-900">{h1}</h1>
        <p className="mt-1 text-[#5b6b7b]">{intro}</p>

        {/* Category filter chips */}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={ciudad ? `/solicitudes?ciudad=${encodeURIComponent(ciudad)}` : "/solicitudes"}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              !categoria
                ? "bg-[#2563a8] text-white"
                : "bg-[#eef3fa] text-[#2563a8]"
            }`}
          >
            {tr("requests.all")}
          </Link>
          {(Object.keys(HELP_CATEGORIES) as HelpCategory[]).map((key) => {
            const c = HELP_CATEGORIES[key];
            const params = new URLSearchParams();
            params.set("categoria", key);
            if (ciudad) params.set("ciudad", ciudad);
            const active = categoria === key;
            return (
              <Link
                key={key}
                href={`/solicitudes?${params.toString()}`}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                  active
                    ? "bg-[#2563a8] text-white"
                    : "bg-[#eef3fa] text-[#2563a8]"
                }`}
              >
                {c.emoji} {tD(`category.${key}`)}
              </Link>
            );
          })}
        </div>

        {/* City filter form */}
        <form method="get" className="mt-4 flex gap-2">
          {categoria && <input type="hidden" name="categoria" value={categoria} />}
          {cat && <input type="hidden" name="cat" value={cat} />}
          {sp.lat != null && <input type="hidden" name="lat" value={sp.lat} />}
          {sp.lng != null && <input type="hidden" name="lng" value={sp.lng} />}
          <input
            name="ciudad"
            defaultValue={ciudad}
            placeholder={tr("requests.filterByCity")}
            aria-label={tr("requests.cityAria")}
            maxLength={80}
            className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-base"
          />
          <button
            type="submit"
            className="shrink-0 rounded-xl bg-[#2563a8] px-5 py-2.5 font-semibold text-white active:scale-[0.99]"
          >
            {tr("requests.filter")}
          </button>
        </form>

        {/* Status filter + use-my-location (sorts nearest within each urgency tier) */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {[
            { v: undefined, label: tr("requests.all") },
            { v: "OPEN" as const, label: tr("requests.statusOpen") },
            { v: "IN_PROGRESS" as const, label: tr("requests.statusInProgress") },
          ].map((s) => {
            const active = estado === s.v || (!estado && !s.v);
            return (
              <Link
                key={s.label}
                href={statusHref(s.v)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                  active ? "bg-[#14212e] text-white" : "bg-slate-100 text-[#5b6b7b]"
                }`}
              >
                {s.label}
              </Link>
            );
          })}
          <span className="ml-auto">
            <UseMyLocationButton
              label={tr("requests.useMyLocation")}
              locating={tr("requests.locating")}
            />
          </span>
        </div>

        {/* Results */}
        <div className="mt-6">
          {requests.length === 0 ? (
            <div className="rounded-2xl border border-[#e6ecf2] bg-white p-6 text-center text-[#5b6b7b]">
              <p className="font-semibold text-[#14212e]">
                {tr("requests.noResults")}
              </p>
              <Link
                href="/necesito-ayuda"
                className="mt-4 inline-block rounded-xl bg-[#2563a8] px-5 py-3 font-semibold text-white"
              >
                {tr("requests.askForHelp")}
              </Link>
            </div>
          ) : (
            <div className="grid gap-3">
              {requests.map((r) => {
                const c = HELP_CATEGORIES[r.category];
                const urgency = URGENCY_LEVELS[r.urgency];
                const distance =
                  r.distanceKm != null
                    ? r.distanceKm < 1
                      ? `${Math.round(r.distanceKm * 1000)} m`
                      : `${r.distanceKm.toFixed(1)} km`
                    : null;
                return (
                  <Link
                    key={r.id}
                    href={`/solicitud/${r.id}`}
                    className="block rounded-2xl border border-[#e6ecf2] bg-white p-4 transition hover:border-[#c9d6e3]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-[#14212e]">
                        {r.place_name || (c ? tD(`category.${r.category}`) : undefined)}
                      </h2>
                      {urgency && (
                        <span
                          className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold"
                          style={{
                            backgroundColor: urgency.tintBg,
                            color: urgency.color,
                          }}
                        >
                          {tD(`urgency.${r.urgency}`)}
                        </span>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#8190a0]">
                      {c && (
                        <span className="rounded-full bg-[#eef3fa] px-2.5 py-1 font-medium text-[#2563a8]">
                          {c.emoji} {tD(`category.${r.category}`)}
                        </span>
                      )}
                      {r.city && <span>📍 {r.city}</span>}
                      {distance && <span>{tr("requests.distanceAway", { distance })}</span>}
                      {r.responseCount ? (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
                          🤝 {tr("requests.offeredCount", { count: r.responseCount })}
                        </span>
                      ) : null}
                    </div>

                    {r.description && (
                      <p className="mt-2 line-clamp-2 text-sm text-[#5b6b7b]">
                        {r.description}
                      </p>
                    )}

                    {r.items?.length ? (
                      <p className="mt-2 text-sm text-[#5b6b7b]">
                        {formatItems(r.items)}
                      </p>
                    ) : null}

                    {r.source && (
                      <p className="mt-2">
                        <SourceBadge source={r.source} url={r.source_url} />
                      </p>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
