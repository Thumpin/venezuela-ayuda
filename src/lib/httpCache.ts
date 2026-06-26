// Política de cache HTTP para respuestas GET públicas e idempotentes, servidas
// por el Edge de Vercel. Vercel cachea la respuesta de un route handler cuando
// éste setea un Cache-Control explícito; en un hit se sirve desde el CDN global
// sin tocar el lambda ni Supabase.
//
//   s-maxage=60               → ventana de frescura del CDN compartido (60s).
//   stale-while-revalidate=300 → hasta 5 min sirve la copia vieja al instante
//                                mientras revalida en background.
//   max-age=0                 → el navegador siempre revalida (sin copia
//                                privada vieja); el cacheo vive sólo en el CDN.
//
// Aplicar SÓLO a respuestas 200. Errores (400/429/503) van sin Cache-Control
// para no envenenar el CDN. La clave de cache es método + path + query string,
// así que cada combinación de type/limit/since/city se cachea por separado.
export const PUBLIC_CDN_CACHE =
  "public, max-age=0, s-maxage=60, stale-while-revalidate=300";
