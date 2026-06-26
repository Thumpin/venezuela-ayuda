// Types + labels for the "centros de acopio / voluntariado en el exterior"
// directory. The DATA now lives in the collection_centers table (read via
// getAbroadCenters in lib/data.ts); these stay here as shared UI types/labels
// used by HelpAbroadList.tsx on the /ayudar-fuera page.

export type HelpNeed = "voluntarios" | "centro-de-acopio";

// Labels + tint colors reuse the existing badge style (tintBg/tintText), see
// CHECKIN_STATUSES in src/lib/constants.ts.
export const HELP_NEEDS: Record<
  HelpNeed,
  { label: string; emoji: string; tintBg: string; tintText: string }
> = {
  "voluntarios": { label: "Voluntarios", emoji: "🤝", tintBg: "#e9f1fb", tintText: "#2563a8" },
  "centro-de-acopio": { label: "Centro de acopio", emoji: "📦", tintBg: "#eef9f2", tintText: "#1f7a52" },
};

export const HELP_NEED_KEYS = Object.keys(HELP_NEEDS) as HelpNeed[];

export type HelpPlace = {
  name: string;
  description?: string; // optional short "how to help"
  address: string;
  website?: string; // optional, rendered as ↗ link
  phone?: string; // optional display number; the tel: link strips punctuation
  needs: HelpNeed[]; // drives badges + global tab filter
};

export type HelpCity = {
  city: string;
  country: string; // for display + search ("Madrid · España")
  places: HelpPlace[];
};
