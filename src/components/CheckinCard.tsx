import Link from "next/link";
import { useTranslations } from "next-intl";
import StatusBadge from "@/components/StatusBadge";
import SourceBadge from "@/components/SourceBadge";
import { timeAgo } from "@/lib/format";
import { CHECKIN_STATUSES, FOUND_BADGE } from "@/lib/constants";
import type { PublicCheckin } from "@/lib/types";

import { getOptimizedPhotoUrl } from "@/lib/imageOptimizer";

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export default function CheckinCard({ c }: { c: PublicCheckin }) {
  const s = CHECKIN_STATUSES[c.status];
  const t = useTranslations("search");
  const tD = useTranslations("domain");
  return (
    <Link
      href={`/persona/${c.id}`}
      className="block rounded-2xl border border-[#e6ecf2] bg-white p-4 transition hover:border-[#c9d6e3]"
    >
      <div className="flex items-center gap-3.5">
        {c.photo_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={getOptimizedPhotoUrl(c.photo_url, 96)}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-12 w-12 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-base font-semibold"
            style={{ backgroundColor: s.tintBg, color: s.tintText }}
          >
            {initials(c.name)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-[#14212e]">{c.name}</h3>
          <p className="mt-0.5 text-xs text-[#8190a0]">
            {c.place_name ? t("card.place", { place: c.place_name }) : ""}
            {c.city ? `${c.city} · ` : ""}
            {t("card.metaUpdated", { time: timeAgo(c.created_at) })}
          </p>
        </div>
        {c.found_at ? (
          <span
            className="shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold"
            style={{ backgroundColor: FOUND_BADGE.tintBg, color: FOUND_BADGE.tintText }}
          >
            {FOUND_BADGE.emoji} {tD("foundBadge")}
          </span>
        ) : (
          <StatusBadge status={c.status} />
        )}
      </div>
      {c.message && (
        <p className="mt-3 line-clamp-2 text-sm text-[#5b6b7b]">“{c.message}”</p>
      )}
      {c.source && <SourceBadge source={c.source} url={c.source_url} className="mt-2" />}
    </Link>
  );
}
