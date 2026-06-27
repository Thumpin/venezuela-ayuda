"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { ChevronsUpDown } from "lucide-react";
import type { Map as MLMap, GeoJSONSource, MapGeoJSONFeature } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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

type MapArea = {
  id: string;
  label: string;
  group: string;
  center: { lng: number; lat: number };
  zoom: number;
  color: string;
};
type ComboboxOption = {
  value: string;
  label: string;
  description?: string;
};

function area(
  id: string,
  label: string,
  group: string,
  lng: number,
  lat: number,
  zoom = 11,
  color = "#2563a8"
): MapArea {
  return { id, label, group, center: { lng, lat }, zoom, color };
}

const MAP_AREAS: MapArea[] = [
  area("venezuela", "Todo el país", "Todo el país", VENEZUELA_CENTER.lng, VENEZUELA_CENTER.lat, DEFAULT_ZOOM, "#14212e"),

  area("caracas", "Caracas", "Caracas", -66.9036, 10.4806, 11, "#2563a8"),
  area("catia", "Catia", "Caracas", -66.9516, 10.5135, 13.2, "#7c3aed"),
  area("23-de-enero", "23 de Enero", "Caracas", -66.9392, 10.5057, 13.4, "#5b6b7b"),
  area("la-pastora", "La Pastora", "Caracas", -66.9165, 10.5124, 13.5, "#b5811f"),
  area("el-valle", "El Valle", "Caracas", -66.9198, 10.4496, 13.1, "#c9483a"),
  area("la-candelaria", "La Candelaria", "Caracas", -66.9002, 10.5045, 13.5, "#e2603a"),
  area("petare", "Petare", "Caracas", -66.8072, 10.4766, 13, "#0d9488"),
  area("chacao", "Chacao", "Caracas", -66.8531, 10.4979, 13.4, "#2f9e6e"),
  area("baruta", "Baruta", "Caracas", -66.8736, 10.4325, 13, "#2563a8"),
  area("el-hatillo", "El Hatillo", "Caracas", -66.8253, 10.4247, 13, "#0d9488"),

  area("puerto-ayacucho", "Puerto Ayacucho", "Amazonas", -67.6236, 5.6639, 11, "#7c3aed"),
  area("san-fernando-de-atabapo", "San Fernando de Atabapo", "Amazonas", -67.6997, 4.0497, 11, "#5b6b7b"),
  area("la-esmeralda", "La Esmeralda", "Amazonas", -65.5492, 3.1667, 11, "#2f9e6e"),
  area("maroa", "Maroa", "Amazonas", -67.56, 2.7186, 11, "#64748b"),

  area("barcelona", "Barcelona", "Anzoátegui", -64.6862, 10.1333, 11.2, "#0891b2"),
  area("puerto-la-cruz", "Puerto La Cruz", "Anzoátegui", -64.6328, 10.2167, 12, "#0284c7"),
  area("lecheria", "Lechería", "Anzoátegui", -64.6681, 10.1967, 12.5, "#0d9488"),
  area("guanta", "Guanta", "Anzoátegui", -64.5942, 10.2342, 12, "#0891b2"),
  area("anaco", "Anaco", "Anzoátegui", -64.4728, 9.4389, 11, "#2563a8"),
  area("el-tigre", "El Tigre", "Anzoátegui", -64.2454, 8.8875, 11, "#ca8a04"),
  area("cantaura", "Cantaura", "Anzoátegui", -64.3589, 9.3057, 11, "#b5811f"),
  area("piritu", "Píritu", "Anzoátegui", -65.0328, 10.0392, 11, "#0284c7"),
  area("pariaguan", "Pariaguán", "Anzoátegui", -64.7108, 8.8436, 11, "#64748b"),

  area("san-fernando-de-apure", "San Fernando de Apure", "Apure", -67.4731, 7.8878, 11, "#16a34a"),
  area("guasdualito", "Guasdualito", "Apure", -70.7325, 7.2424, 11, "#2f9e6e"),
  area("achaguas", "Achaguas", "Apure", -68.2231, 7.7792, 11, "#16a34a"),
  area("elorza", "Elorza", "Apure", -69.4977, 7.0609, 11, "#5b6b7b"),
  area("biruaca", "Biruaca", "Apure", -67.5167, 7.8447, 11, "#0d9488"),

  area("maracay", "Maracay", "Aragua", -67.5958, 10.2469, 11.2, "#ca8a04"),
  area("turmero", "Turmero", "Aragua", -67.4747, 10.2286, 11.5, "#b5811f"),
  area("la-victoria", "La Victoria", "Aragua", -67.3312, 10.2268, 11, "#c9483a"),
  area("cagua", "Cagua", "Aragua", -67.4594, 10.1864, 11, "#e2603a"),
  area("el-limon", "El Limón", "Aragua", -67.6311, 10.3056, 12, "#ca8a04"),
  area("palo-negro", "Palo Negro", "Aragua", -67.5589, 10.1739, 11, "#5b6b7b"),
  area("villa-de-cura", "Villa de Cura", "Aragua", -67.4894, 10.0386, 11, "#7c3aed"),
  area("colonia-tovar", "Colonia Tovar", "Aragua", -67.2917, 10.4167, 11, "#2563a8"),

  area("barinas", "Barinas", "Barinas", -70.2075, 8.6226, 11, "#2f9e6e"),
  area("socopo", "Socopó", "Barinas", -70.8214, 8.2306, 11, "#16a34a"),
  area("sabaneta", "Sabaneta", "Barinas", -69.9333, 8.75, 11, "#0d9488"),
  area("santa-barbara-de-barinas", "Santa Bárbara de Barinas", "Barinas", -71.1778, 7.8136, 11, "#5b6b7b"),
  area("barinitas", "Barinitas", "Barinas", -70.4111, 8.7633, 11, "#2f9e6e"),

  area("ciudad-bolivar", "Ciudad Bolívar", "Bolívar", -63.5497, 8.1222, 11, "#b5811f"),
  area("ciudad-guayana", "Ciudad Guayana", "Bolívar", -62.641, 8.3512, 11, "#ca8a04"),
  area("puerto-ordaz", "Puerto Ordaz", "Bolívar", -62.7333, 8.3, 11, "#ca8a04"),
  area("san-felix-bolivar", "San Félix", "Bolívar", -62.6425, 8.3447, 11, "#b5811f"),
  area("upata", "Upata", "Bolívar", -62.4056, 8.0086, 11, "#16a34a"),
  area("santa-elena-de-uairen", "Santa Elena de Uairén", "Bolívar", -61.1103, 4.6023, 11, "#2f9e6e"),
  area("tumeremo", "Tumeremo", "Bolívar", -61.5008, 7.2986, 11, "#7c3aed"),
  area("el-callao", "El Callao", "Bolívar", -61.8267, 7.3472, 11, "#c9483a"),
  area("caicara-del-orinoco", "Caicara del Orinoco", "Bolívar", -66.1656, 7.635, 11, "#5b6b7b"),

  area("valencia", "Valencia", "Carabobo", -68.0033, 10.1579, 11.2, "#16a34a"),
  area("puerto-cabello", "Puerto Cabello", "Carabobo", -68.0125, 10.4731, 11, "#0891b2"),
  area("guacara", "Guacara", "Carabobo", -67.8767, 10.2261, 11, "#2f9e6e"),
  area("naguanagua", "Naguanagua", "Carabobo", -68.0086, 10.2572, 12, "#2563a8"),
  area("san-diego", "San Diego", "Carabobo", -67.9542, 10.2547, 12, "#0d9488"),
  area("mariara", "Mariara", "Carabobo", -67.7175, 10.2964, 11, "#16a34a"),
  area("los-guayos", "Los Guayos", "Carabobo", -67.9389, 10.1897, 11, "#64748b"),
  area("tocuyito", "Tocuyito", "Carabobo", -68.0858, 10.1136, 11, "#ca8a04"),
  area("moron", "Morón", "Carabobo", -68.2006, 10.4872, 11, "#0284c7"),
  area("guigue", "Güigüe", "Carabobo", -67.7792, 10.0853, 11, "#b5811f"),

  area("san-carlos", "San Carlos", "Cojedes", -68.5827, 9.6612, 11, "#16a34a"),
  area("tinaquillo", "Tinaquillo", "Cojedes", -68.3047, 9.9186, 11, "#2f9e6e"),
  area("tinaco", "Tinaco", "Cojedes", -68.4333, 9.7, 11, "#0d9488"),
  area("el-baul", "El Baúl", "Cojedes", -68.2958, 8.9622, 11, "#5b6b7b"),

  area("tucupita", "Tucupita", "Delta Amacuro", -62.051, 9.0622, 11, "#0891b2"),
  area("pedernales", "Pedernales", "Delta Amacuro", -62.2583, 9.9747, 11, "#0284c7"),
  area("curiapo", "Curiapo", "Delta Amacuro", -60.9917, 8.5656, 11, "#0d9488"),

  area("coro", "Coro", "Falcón", -69.6813, 11.4045, 11, "#ca8a04"),
  area("punto-fijo", "Punto Fijo", "Falcón", -70.1996, 11.6915, 11, "#b5811f"),
  area("tucacas", "Tucacas", "Falcón", -68.3244, 10.7906, 11, "#0891b2"),
  area("chichiriviche", "Chichiriviche", "Falcón", -68.275, 10.9281, 11, "#0284c7"),
  area("la-vela-de-coro", "La Vela de Coro", "Falcón", -69.565, 11.4611, 11, "#ca8a04"),
  area("puerto-cumarebo", "Puerto Cumarebo", "Falcón", -69.3506, 11.4861, 11, "#b5811f"),
  area("churuguara", "Churuguara", "Falcón", -69.5386, 10.8139, 11, "#7c3aed"),
  area("dabajuro", "Dabajuro", "Falcón", -70.6778, 11.0222, 11, "#5b6b7b"),

  area("san-juan-de-los-morros", "San Juan de los Morros", "Guárico", -67.3538, 9.9115, 11, "#e2603a"),
  area("valle-de-la-pascua", "Valle de la Pascua", "Guárico", -66.0078, 9.2156, 11, "#c9483a"),
  area("calabozo", "Calabozo", "Guárico", -67.4293, 8.9242, 11, "#ca8a04"),
  area("zaraza", "Zaraza", "Guárico", -65.3247, 9.3503, 11, "#b5811f"),
  area("altagracia-de-orituco", "Altagracia de Orituco", "Guárico", -66.3814, 9.8608, 11, "#e2603a"),
  area("tucupido", "Tucupido", "Guárico", -65.7706, 9.2739, 11, "#5b6b7b"),
  area("el-sombrero", "El Sombrero", "Guárico", -67.0583, 9.3861, 11, "#64748b"),

  area("la-guaira", "La Guaira", "La Guaira", -66.933, 10.6016, 11.8, "#0891b2"),
  area("maiquetia", "Maiquetía", "La Guaira", -66.9712, 10.597, 13, "#0284c7"),
  area("catia-la-mar", "Catia La Mar", "La Guaira", -67.0303, 10.6053, 12, "#0d9488"),
  area("caraballeda", "Caraballeda", "La Guaira", -66.8517, 10.6111, 12, "#16a34a"),
  area("macuto", "Macuto", "La Guaira", -66.895, 10.6067, 12, "#2563a8"),
  area("naiguata", "Naiguatá", "La Guaira", -66.7406, 10.6139, 12, "#0891b2"),
  area("carayaca", "Carayaca", "La Guaira", -67.12, 10.54, 11, "#5b6b7b"),

  area("barquisimeto", "Barquisimeto", "Lara", -69.3228, 10.0678, 11, "#c9483a"),
  area("cabudare", "Cabudare", "Lara", -69.2503, 10.0289, 11, "#e2603a"),
  area("carora", "Carora", "Lara", -70.0792, 10.1728, 11, "#b5811f"),
  area("el-tocuyo", "El Tocuyo", "Lara", -69.7933, 9.7875, 11, "#ca8a04"),
  area("quibor", "Quíbor", "Lara", -69.6203, 9.9287, 11, "#7c3aed"),
  area("duaca", "Duaca", "Lara", -69.1639, 10.285, 11, "#64748b"),

  area("merida", "Mérida", "Mérida", -71.1448, 8.5897, 11, "#2563a8"),
  area("ejido", "Ejido", "Mérida", -71.2375, 8.5514, 11, "#0d9488"),
  area("el-vigia", "El Vigía", "Mérida", -71.6506, 8.6136, 11, "#0891b2"),
  area("tovar", "Tovar", "Mérida", -71.7564, 8.3333, 11, "#7c3aed"),
  area("lagunillas-merida", "Lagunillas", "Mérida", -71.3861, 8.5056, 11, "#5b6b7b"),
  area("timotes", "Timotes", "Mérida", -70.7394, 8.9825, 11, "#64748b"),

  area("los-teques", "Los Teques", "Miranda", -67.0433, 10.3445, 12, "#0d9488"),
  area("guarenas", "Guarenas", "Miranda", -66.6167, 10.4667, 11, "#0891b2"),
  area("guatire", "Guatire", "Miranda", -66.5428, 10.4744, 11, "#0284c7"),
  area("charallave", "Charallave", "Miranda", -66.8572, 10.2433, 11, "#ca8a04"),
  area("ocumare-del-tuy", "Ocumare del Tuy", "Miranda", -66.775, 10.1167, 11, "#b5811f"),
  area("cua", "Cúa", "Miranda", -66.8853, 10.1622, 11, "#c9483a"),
  area("santa-teresa-del-tuy", "Santa Teresa del Tuy", "Miranda", -66.6633, 10.2342, 11, "#e2603a"),
  area("higuerote", "Higuerote", "Miranda", -66.1006, 10.4806, 11, "#0891b2"),
  area("rio-chico", "Río Chico", "Miranda", -65.9733, 10.3206, 11, "#0284c7"),
  area("caucagua", "Caucagua", "Miranda", -66.3828, 10.285, 11, "#0d9488"),
  area("san-antonio-de-los-altos", "San Antonio de los Altos", "Miranda", -66.9511, 10.3889, 11, "#2563a8"),

  area("maturin", "Maturín", "Monagas", -63.1767, 9.7457, 11, "#0d9488"),
  area("punta-de-mata", "Punta de Mata", "Monagas", -63.61, 9.6914, 11, "#16a34a"),
  area("caripito", "Caripito", "Monagas", -63.0994, 10.1111, 11, "#0891b2"),
  area("temblador", "Temblador", "Monagas", -62.6425, 9.0058, 11, "#5b6b7b"),
  area("caripe", "Caripe", "Monagas", -63.4817, 10.175, 11, "#2f9e6e"),
  area("barrancas-del-orinoco", "Barrancas del Orinoco", "Monagas", -62.1986, 8.6986, 11, "#64748b"),

  area("la-asuncion", "La Asunción", "Nueva Esparta", -63.8628, 11.0333, 11, "#0891b2"),
  area("porlamar", "Porlamar", "Nueva Esparta", -63.8491, 10.957, 11.5, "#0284c7"),
  area("pampatar", "Pampatar", "Nueva Esparta", -63.7931, 11.0014, 11.5, "#0d9488"),
  area("juan-griego", "Juan Griego", "Nueva Esparta", -63.9656, 11.0817, 11, "#2563a8"),
  area("punta-de-piedras", "Punta de Piedras", "Nueva Esparta", -64.0969, 10.9011, 11, "#5b6b7b"),
  area("el-valle-del-espiritu-santo", "El Valle del Espíritu Santo", "Nueva Esparta", -63.895, 10.9825, 11, "#7c3aed"),

  area("guanare", "Guanare", "Portuguesa", -69.7421, 9.0436, 11, "#2f9e6e"),
  area("acarigua", "Acarigua", "Portuguesa", -69.1956, 9.5597, 11, "#16a34a"),
  area("araure", "Araure", "Portuguesa", -69.2167, 9.5667, 11, "#0d9488"),
  area("turen", "Turén", "Portuguesa", -69.1208, 9.2667, 11, "#ca8a04"),
  area("ospino", "Ospino", "Portuguesa", -69.4558, 9.295, 11, "#5b6b7b"),
  area("biscucuy", "Biscucuy", "Portuguesa", -69.9847, 9.3567, 11, "#7c3aed"),

  area("cumana", "Cumaná", "Sucre", -64.1826, 10.4635, 11, "#0891b2"),
  area("carupano", "Carúpano", "Sucre", -63.2585, 10.6678, 11, "#0284c7"),
  area("guiria", "Güiria", "Sucre", -62.2989, 10.5772, 11, "#0d9488"),
  area("rio-caribe", "Río Caribe", "Sucre", -63.1097, 10.6972, 11, "#2563a8"),
  area("cariaco", "Cariaco", "Sucre", -63.5533, 10.4972, 11, "#5b6b7b"),
  area("araya", "Araya", "Sucre", -64.255, 10.575, 11, "#64748b"),

  area("san-cristobal", "San Cristóbal", "Táchira", -72.2244, 7.7669, 11, "#7c3aed"),
  area("tariba", "Táriba", "Táchira", -72.225, 7.8186, 11, "#2563a8"),
  area("rubio", "Rubio", "Táchira", -72.3556, 7.7017, 11, "#0d9488"),
  area("san-antonio-del-tachira", "San Antonio del Táchira", "Táchira", -72.4431, 7.8142, 11, "#c9483a"),
  area("urena", "Ureña", "Táchira", -72.4425, 7.9161, 11, "#e2603a"),
  area("la-grita", "La Grita", "Táchira", -71.9833, 8.1333, 11, "#5b6b7b"),
  area("colon-tachira", "Colón", "Táchira", -72.2606, 8.0319, 11, "#ca8a04"),
  area("la-fria", "La Fría", "Táchira", -72.2439, 8.215, 11, "#0891b2"),

  area("trujillo", "Trujillo", "Trujillo", -70.4347, 9.3658, 11, "#5b6b7b"),
  area("valera", "Valera", "Trujillo", -70.6036, 9.3178, 11, "#64748b"),
  area("bocono", "Boconó", "Trujillo", -70.2694, 9.2539, 11, "#16a34a"),
  area("carache", "Carache", "Trujillo", -70.2294, 9.6283, 11, "#2f9e6e"),
  area("sabana-de-mendoza", "Sabana de Mendoza", "Trujillo", -70.7722, 9.435, 11, "#ca8a04"),
  area("escuque", "Escuque", "Trujillo", -70.6711, 9.2967, 11, "#7c3aed"),

  area("san-felipe", "San Felipe", "Yaracuy", -68.7425, 10.3399, 11, "#16a34a"),
  area("yaritagua", "Yaritagua", "Yaracuy", -69.1242, 10.08, 11, "#2f9e6e"),
  area("chivacoa", "Chivacoa", "Yaracuy", -68.895, 10.16, 11, "#ca8a04"),
  area("nirgua", "Nirgua", "Yaracuy", -68.5667, 10.15, 11, "#0d9488"),
  area("cocorote", "Cocorote", "Yaracuy", -68.7817, 10.3192, 11, "#5b6b7b"),
  area("independencia-yaracuy", "Independencia", "Yaracuy", -68.755, 10.3342, 11, "#64748b"),

  area("maracaibo", "Maracaibo", "Zulia", -71.6337, 10.6427, 11, "#dc2626"),
  area("cabimas", "Cabimas", "Zulia", -71.4506, 10.3883, 11, "#c9483a"),
  area("ciudad-ojeda", "Ciudad Ojeda", "Zulia", -71.3144, 10.2008, 11, "#e2603a"),
  area("san-francisco-zulia", "San Francisco", "Zulia", -71.6333, 10.5533, 11, "#dc2626"),
  area("machiques", "Machiques", "Zulia", -72.545, 10.0644, 11, "#b5811f"),
  area("santa-barbara-del-zulia", "Santa Bárbara del Zulia", "Zulia", -71.9136, 8.9833, 11, "#0891b2"),
  area("villa-del-rosario", "La Villa del Rosario", "Zulia", -72.3139, 10.325, 11, "#5b6b7b"),
  area("los-puertos-de-altagracia", "Los Puertos de Altagracia", "Zulia", -71.5242, 10.715, 11, "#0284c7"),
  area("bachaquero", "Bachaquero", "Zulia", -71.1494, 9.9697, 11, "#64748b"),
  area("mene-grande", "Mene Grande", "Zulia", -70.9333, 9.8167, 11, "#ca8a04"),

  area("los-roques", "Los Roques", "Dependencias Federales", -66.75, 11.95, 11, "#0891b2"),
  area("la-orchila", "La Orchila", "Dependencias Federales", -66.1833, 11.8, 11, "#5b6b7b"),
  area("isla-la-tortuga", "Isla La Tortuga", "Dependencias Federales", -65.3167, 10.95, 11, "#64748b"),
];

const DEFAULT_AREA = MAP_AREAS.find((area) => area.id === "venezuela") ?? MAP_AREAS[0];

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

function areaAroundPoint(
  label: string,
  group: string,
  center: { lng: number; lat: number },
  color: string
): MapArea {
  return {
    id: "current-location",
    label,
    group,
    center,
    zoom: 14,
    color,
  };
}

function AreaCombobox({
  label,
  value,
  options,
  searchPlaceholder,
  emptyText,
  onChange,
}: {
  label: string;
  value: string;
  options: ComboboxOption[];
  searchPlaceholder: string;
  emptyText: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <div className="grid gap-1 text-sm font-semibold text-slate-700">
      <span>{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-full justify-between rounded-lg border-slate-300 bg-white px-3 py-2 text-left text-base font-bold text-slate-900 hover:bg-white"
            />
          }
        >
          <span className="truncate">{selected?.label ?? label}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 text-slate-400" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(calc(100vw-2rem),24rem)] p-0">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={`${option.label} ${option.description ?? ""}`}
                    data-checked={option.value === value}
                    onSelect={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{option.label}</div>
                      {option.description && (
                        <div className="truncate text-xs text-muted-foreground">
                          {option.description}
                        </div>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default function MapView({
  markers,
  heightClass = "h-[70vh] min-h-[420px]",
  initialZoom = DEFAULT_ZOOM,
  locationFirst = false,
}: {
  markers: MapMarker[];
  heightClass?: string;
  initialZoom?: number;
  locationFirst?: boolean;
}) {
  const t = useTranslations("map");
  const tCommon = useTranslations("common");
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState<Set<MarkerKind>>(new Set(ALL_KINDS));
  const [selectedArea, setSelectedArea] = useState<MapArea>(DEFAULT_AREA);
  const [locationStatus, setLocationStatus] = useState<"idle" | "loading" | "error">("idle");
  const isAllVenezuelaSelected = selectedArea.id === "venezuela";

  const filtered = useMemo(
    () => markers.filter((m) => active.has(m.kind)),
    [markers, active]
  );
  const stateOptions = useMemo(() => {
    const groups = Array.from(new Set(MAP_AREAS.map((area) => area.group)));
    if (selectedArea.id === "current-location") return [selectedArea.group, ...groups];
    return groups;
  }, [selectedArea]);
  const cityOptions = useMemo(() => {
    if (selectedArea.id === "current-location") return [selectedArea];
    return MAP_AREAS.filter((area) => area.group === selectedArea.group);
  }, [selectedArea]);
  const stateComboboxOptions = useMemo(
    () => stateOptions.map((group) => ({ value: group, label: group })),
    [stateOptions]
  );
  const cityComboboxOptions = useMemo(
    () =>
      cityOptions.map((area) => ({
        value: area.id,
        label: area.label,
        description: area.group,
      })),
    [cityOptions]
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
        center: locationFirst
          ? [DEFAULT_AREA.center.lng, DEFAULT_AREA.center.lat]
          : [VENEZUELA_CENTER.lng, VENEZUELA_CENTER.lat],
        zoom: locationFirst ? DEFAULT_AREA.zoom : initialZoom,
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

  useEffect(() => {
    if (!ready || !locationFirst) return;
    mapRef.current?.easeTo({
      center: [selectedArea.center.lng, selectedArea.center.lat],
      zoom: selectedArea.zoom,
      duration: 850,
    });
  }, [locationFirst, ready, selectedArea]);

  function toggle(kind: MarkerKind) {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  function selectArea(areaId: string) {
    const area = MAP_AREAS.find((item) => item.id === areaId);
    if (area) setSelectedArea(area);
  }

  function selectState(group: string) {
    if (group === selectedArea.group) return;
    const area = MAP_AREAS.find((item) => item.group === group);
    if (area) setSelectedArea(area);
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationStatus("error");
      return;
    }

    setLocationStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userArea = areaAroundPoint(
          t("area.currentLocation"),
          t("area.personal"),
          {
            lng: position.coords.longitude,
            lat: position.coords.latitude,
          },
          "#2f9e6e"
        );
        setSelectedArea(userArea);
        setLocationStatus("idle");
      },
      () => setLocationStatus("error"),
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 60000 }
    );
  }

  const frameStyle = locationFirst
    ? ({
        "--area-color": selectedArea.color,
      } as CSSProperties)
    : undefined;

  return (
    <div className="flex flex-col" style={frameStyle}>
      {locationFirst && (
        <div className="px-4 pb-2 pt-3">
          <div className="rounded-lg border border-[var(--area-color)] bg-white p-3 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className={`grid flex-1 gap-3 ${isAllVenezuelaSelected ? "" : "sm:grid-cols-2"}`}>
                <AreaCombobox
                  label={t("area.stateLabel")}
                  value={selectedArea.group}
                  options={stateComboboxOptions}
                  searchPlaceholder={t("area.searchState")}
                  emptyText={t("area.noState")}
                  onChange={selectState}
                />

                {!isAllVenezuelaSelected && (
                  <AreaCombobox
                    label={t("area.cityLabel")}
                    value={selectedArea.id}
                    options={cityComboboxOptions}
                    searchPlaceholder={t("area.searchCity")}
                    emptyText={t("area.noCity")}
                    onChange={selectArea}
                  />
                )}
              </div>

              <div className="flex flex-wrap gap-2 lg:justify-end">
                <button
                  type="button"
                  onClick={useCurrentLocation}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#2f9e6e] px-3 py-2 text-sm font-bold text-white"
                >
                  {locationStatus === "loading" ? t("area.locating") : t("area.nearMe")}
                </button>
                <button
                  type="button"
                  onClick={() => selectArea("venezuela")}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700"
                >
                  {t("area.allVenezuela")}
                </button>
                {locationStatus === "error" && (
                  <span className="basis-full text-sm font-semibold text-red-600">
                    {t("area.locationError")}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

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
        <div
          className={
            locationFirst
              ? "mx-4 overflow-hidden rounded-xl border-4 border-[var(--area-color)] shadow-lg shadow-slate-900/10"
              : ""
          }
        >
          <div ref={containerRef} className={`${heightClass} w-full`} />
        </div>
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100 text-slate-500">
            {t("loading")}
          </div>
        )}
        <p className="absolute bottom-3 left-6 z-10 rounded bg-white/90 px-2 py-0.5 text-xs font-semibold text-slate-600">
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
