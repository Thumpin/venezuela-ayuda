import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from "./config";

// Messages are split per namespace (one JSON file each, per locale) so the app
// scales cleanly and pages can be translated independently. Add a namespace
// here when you add a messages/<locale>/<ns>.json pair.
const NAMESPACES = [
  "common",
  "domain",
  "header",
  "home",
  "donate",
  "emergency",
  "measures",
  "search",
  "map",
  "create",
  "detail",
  "components",
  "forms",
  "abroad",
  "gallery",
  "risk",
  "alerts",
  "children",
] as const;

// No i18n routing: the active locale comes from a cookie (set by the language
// toggle), defaulting to Spanish.
export default getRequestConfig(async () => {
  const store = await cookies();
  const cookieLocale = store.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;

  const entries = await Promise.all(
    NAMESPACES.map(
      async (ns) =>
        [ns, (await import(`../../messages/${locale}/${ns}.json`)).default] as const
    )
  );

  return { locale, messages: Object.fromEntries(entries) };
});
