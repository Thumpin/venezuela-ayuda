"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { Map as MLMap, GeoJSONSource, MapGeoJSONFeature } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { VENEZUELA_CENTER, DEFAULT_ZOOM } from "@/lib/constants";
import { getMapStyle } from "@/lib/mapStyle";
import type { MapMarker, MarkerKind } from "@/lib/types";

// Visible label TEXT lives in the `map` namespace (map.kind.<key>); only
// emoji/colors/logic stay here.
const KIND_META: Record<MarkerKind, { color: string; emoji: string }> = {
  need: { color: "#e2603a", emoji: "🆘" },
  missing: { color: "#b5811f", emoji: "🔎" },
  helper: { color: "#2563a8", emoji: "🤝" },
  center: { color: "#0d9488", emoji: "📦" },
  damaged: { color: "#7f1d1d", emoji: "🏚️" },
};
const ALL_KINDS = Object.keys(KIND_META) as MarkerKind[];
type GeoJsonPoint = { type: "Point"; coordinates: number[] };

function toGeoJSON(markers: MapMarker[]) {
  return {
    type: "FeatureCollection" as const,
    features: markers.map((m) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [m.lng, m.lat] },
      properties: {
        id: m.id,
        kind: m.kind,
        title: m.title,
        subtitle: m.subtitle ?? "",
        href: m.href,
        confidence: m.confidence ?? "",
        source: m.source ?? "",
        note: m.note ?? "",
        linkLabel: m.linkLabel ?? "",
        approx: m.approx ? "1" : "",
        color: m.color ?? "",
      },
    })),
  };
}

export default function MapView({
  markers,
  heightClass = "h-[70vh] min-h-[420px]",
  initialZoom = DEFAULT_ZOOM,
}: {
  markers: MapMarker[];
  heightClass?: string;
  initialZoom?: number;
}) {
  const t = useTranslations("map");
  const tCommon = useTranslations("common");
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState<Set<MarkerKind>>(new Set(ALL_KINDS));

  const filtered = useMemo(
    () => markers.filter((m) => active.has(m.kind)),
    [markers, active]
  );

  // One-time map init.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;

    (async () => {
      const maplibre = await import("maplibre-gl");
      if (cancelled || !containerRef.current) return;

      const map = new maplibre.Map({
        container: containerRef.current,
        style: getMapStyle(),
        center: [VENEZUELA_CENTER.lng, VENEZUELA_CENTER.lat],
        zoom: initialZoom,
        attributionControl: { compact: true },
      });
      map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
      map.addControl(
        new maplibre.GeolocateControl({ trackUserLocation: false }),
        "top-right"
      );

      map.on("load", () => {
        map.addSource("points", {
          type: "geojson",
          data: toGeoJSON(markers),
          cluster: true,
          clusterRadius: 50,
          clusterMaxZoom: 13,
        });

        // Cluster bubbles.
        map.addLayer({
          id: "clusters",
          type: "circle",
          source: "points",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#0f172a",
            "circle-opacity": 0.85,
            "circle-radius": ["step", ["get", "point_count"], 16, 25, 22, 100, 30],
          },
        });
        map.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: "points",
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-size": 13,
          },
          paint: { "text-color": "#ffffff" },
        });

        // Individual points colored by kind — unless the marker carries its own
        // `color` (e.g. damaged buildings tinted by severity).
        const kindColor: (string | string[])[] = ["match", ["get", "kind"]];
        for (const k of ALL_KINDS) kindColor.push(k, KIND_META[k].color);
        kindColor.push("#64748b");
        const colorExpr = ["case", ["==", ["get", "color"], ""], kindColor, ["get", "color"]];
        map.addLayer({
          id: "unclustered",
          type: "circle",
          source: "points",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": colorExpr as unknown as string,
            "circle-radius": 9,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          },
        });

        // Zoom into a cluster on tap.
        map.on("click", "clusters", async (e) => {
          const f = map.queryRenderedFeatures(e.point, { layers: ["clusters"] })[0];
          const clusterId = f.properties?.cluster_id;
          const src = map.getSource("points") as GeoJSONSource;
          const zoom = await src.getClusterExpansionZoom(clusterId);
          map.easeTo({ center: (f.geometry as GeoJsonPoint).coordinates as [number, number], zoom });
        });

        // Popup on point tap.
        map.on("click", "unclustered", (e) => {
          const f = e.features?.[0] as MapGeoJSONFeature | undefined;
          if (!f) return;
          const p = f.properties as Record<string, string>;
          const meta = KIND_META[p.kind as MarkerKind] ?? KIND_META.need;
          const kindLabel = t(`kind.${p.kind}`);
          const coords = (f.geometry as GeoJsonPoint).coordinates.slice() as [number, number];
          const external = p.href?.startsWith("http");
          const linkLabel = p.linkLabel || (external ? t("popup.directions") : t("popup.detail"));
          const confidenceLabel = t("popup.confidence");
          const sourceLabel = t("popup.source");
          const approxText = tCommon("approximate");
          const html = `<div style="max-width:230px;font-family:system-ui">
            <div style="font-weight:700;color:${meta.color}">${meta.emoji} ${escapeHtml(kindLabel)}</div>
            <div style="font-weight:600;margin-top:2px">${escapeHtml(p.title)}</div>
            ${p.subtitle ? `<div style="color:#475569;font-size:13px;margin-top:2px">${escapeHtml(p.subtitle)}</div>` : ""}
            ${p.confidence ? `<div style="font-size:12px;margin-top:6px"><b>${escapeHtml(confidenceLabel)}</b> ${escapeHtml(p.confidence)}</div>` : ""}
            ${p.source ? `<div style="font-size:12px;margin-top:2px;color:#475569"><b>${escapeHtml(sourceLabel)}</b> ${escapeHtml(p.source)}</div>` : ""}
            ${p.note ? `<div style="font-size:11px;margin-top:4px;color:#94a3b8;font-style:italic">${escapeHtml(p.note)}</div>` : ""}
            ${p.approx ? `<div style="font-size:11px;margin-top:4px;color:#94a3b8">📍 ${escapeHtml(approxText)}</div>` : ""}
            ${
              p.href
                ? external
                  ? `<a href="${escapeAttr(p.href)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-top:8px;color:#2563eb;font-weight:600">${escapeHtml(linkLabel)}</a>`
                  : `<a href="${escapeAttr(p.href)}" style="display:inline-block;margin-top:8px;color:#2563eb;font-weight:600">${escapeHtml(linkLabel)}</a>`
                : ""
            }
          </div>`;
          new maplibre.Popup({ closeButton: true, maxWidth: "260px" })
            .setLngLat(coords)
            .setHTML(html)
            .addTo(map);
        });

        for (const id of ["clusters", "unclustered"]) {
          map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
          map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
        }

        setReady(true);
      });

      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push filtered data whenever the active set changes.
  useEffect(() => {
    if (!ready) return;
    const src = mapRef.current?.getSource("points") as GeoJSONSource | undefined;
    src?.setData(toGeoJSON(filtered));
  }, [filtered, ready]);

  function toggle(kind: MarkerKind) {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  return (
    <div className="flex flex-col">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 px-4 py-3">
        {ALL_KINDS.map((k) => {
          const on = active.has(k);
          const m = KIND_META[k];
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(k)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-semibold transition ${
                on ? "text-white" : "bg-white text-slate-500"
              }`}
              style={on ? { backgroundColor: m.color, borderColor: m.color } : { borderColor: "#cbd5e1" }}
            >
              <span aria-hidden>{m.emoji}</span> {t(`kind.${k}`)}
            </button>
          );
        })}
      </div>

      <div className="relative">
        <div ref={containerRef} className={`${heightClass} w-full`} />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100 text-slate-500">
            {t("loading")}
          </div>
        )}
        <p className="absolute bottom-1 left-2 z-10 rounded bg-white/80 px-2 py-0.5 text-xs text-slate-600">
          {t("onMap", { count: filtered.length })}
        </p>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}
