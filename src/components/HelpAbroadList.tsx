"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  HELP_NEEDS,
  HELP_NEED_KEYS,
  type HelpCity,
  type HelpNeed,
  type HelpPlace,
} from "@/lib/helpAbroad";

// Tabs filter the whole list by need. "all" shows everything.
type TabKey = "all" | HelpNeed;

const TAB_KEYS: TabKey[] = ["all", ...HELP_NEED_KEYS];

export default function HelpAbroadList({ cities }: { cities: HelpCity[] }) {
  const t = useTranslations("abroad");
  const [tab, setTab] = useState<TabKey>("all");
  const [query, setQuery] = useState("");

  // Tab labels are localized; "all" has its own key, needs use need.<key>.
  const tabLabel = (key: TabKey) =>
    key === "all" ? t("tabAll") : t(`need.${key}`);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cities
      .map((city) => {
        const places = city.places.filter((p) => {
          const matchesNeed = tab === "all" || p.needs.includes(tab);
          if (!matchesNeed) return false;
          if (!q) return true;
          const haystack = [
            city.city,
            city.country,
            p.name,
            p.address,
            p.description ?? "",
            p.resources ?? "",
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(q);
        });
        return { ...city, places };
      })
      .filter((city) => city.places.length > 0);
  }, [cities, tab, query]);

  return (
    <div>
      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
        {TAB_KEYS.map((key) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-pressed={active}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                active
                  ? "bg-white text-[#14212e] shadow-sm"
                  : "text-[#5b6b7b] hover:text-[#14212e]"
              }`}
            >
              {tabLabel(key)}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("searchPlaceholder")}
        className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-[#2563a8]"
      />

      {/* Results */}
      {filtered.length === 0 ? (
        <p className="mt-6 text-center text-slate-500">{t("noResults")}</p>
      ) : (
        <div className="mt-6 space-y-7">
          {filtered.map((city) => (
            <section key={`${city.city}-${city.country}`}>
              <h2 className="flex items-baseline gap-2 text-lg font-bold text-[#14212e]">
                {city.city} · {city.country}
                <span className="text-sm font-medium text-[#8190a0]">
                  {t("placeCount", { count: city.places.length })}
                </span>
              </h2>
              <ul className="mt-3 space-y-3">
                {city.places.map((p) => (
                  <li key={p.name}>
                    <PlaceCard place={p} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function PlaceCard({ place }: { place: HelpPlace }) {
  const t = useTranslations("abroad");
  return (
    <div className="rounded-2xl border border-[#e6ecf2] bg-white p-4">
      <h3 className="text-base font-semibold text-[#14212e]">{place.name}</h3>
      {place.description && (
        <p className="mt-1 text-sm leading-relaxed text-[#5b6b7b]">
          {place.description}
        </p>
      )}

      {place.address && (
        <p className="mt-2 text-sm text-[#33414f]">📍 {place.address}</p>
      )}

      {place.resources && (
        <div className="mt-2 rounded-lg border border-[#e6ecf2] bg-[#f7fafd] px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8190a0]">
            📦 {t("receives")}
          </p>
          <p className="mt-0.5 text-sm text-[#33414f]">{place.resources}</p>
        </div>
      )}

      {(place.phone || place.website || place.mapsQuery) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {place.phone && (
            <a
              href={`tel:${place.phone.replace(/[^+\d]/g, "")}`}
              className="font-semibold text-[#2563a8]"
            >
              📞 {place.phone}
            </a>
          )}
          {place.website && (
            <a
              href={place.website}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[#2563a8]"
            >
              {t("website")}
            </a>
          )}
          {place.mapsQuery && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.mapsQuery)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[#2563a8]"
            >
              🧭 {t("directions")}
            </a>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {place.needs.map((need) => {
          const n = HELP_NEEDS[need];
          return (
            <span
              key={need}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold"
              style={{ backgroundColor: n.tintBg, color: n.tintText }}
            >
              <span aria-hidden>{n.emoji}</span>
              {t(`need.${need}`)}
            </span>
          );
        })}
        {place.canShip && (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[#eef9f2] px-3 py-1 text-xs font-semibold text-[#1f7a52]">
            ✈️ {t("shipsToVe")}
          </span>
        )}
        {place.needsVolunteers && (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[#e9f1fb] px-3 py-1 text-xs font-semibold text-[#2563a8]">
            🙋 {t("needsVolunteers")}
          </span>
        )}
        {place.volunteersCount != null && place.volunteersCount > 0 && (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-[#5b6b7b]">
            👥 {t("volunteers", { count: place.volunteersCount })}
          </span>
        )}
      </div>
    </div>
  );
}
