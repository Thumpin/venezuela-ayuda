import type { StyleSpecification } from "maplibre-gl";

// Keyless raster style using OpenStreetMap tiles so the map works out of the
// box with no API token. For production set NEXT_PUBLIC_MAP_STYLE_URL to a
// vector style from a provider with an SLA (e.g. MapTiler) — see README.
//
// Raster tiles are also lighter to render on low-end phones than vector tiles.
export const OSM_RASTER_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: [
        "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap",
      maxzoom: 19,
    },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#e2e8f0" } },
    { id: "osm", type: "raster", source: "osm" },
  ],
};

export function getMapStyle(): string | StyleSpecification {
  return process.env.NEXT_PUBLIC_MAP_STYLE_URL || OSM_RASTER_STYLE;
}
