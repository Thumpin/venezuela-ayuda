import Script from "next/script";

export const metadata = {
  title: "API · Venezuela Ayuda",
  description: "Documentación de la API del hub central.",
  robots: { index: false },
};

// Documentación interactiva de la API. Renderiza public/openapi.yaml con Scalar
// (un solo script de CDN; auto-monta al encontrar el elemento con data-url).
// El repo no define CSP, así que el CDN no se bloquea (ver U7 del plan).
export default function DocsPage() {
  return (
    <>
      <script id="api-reference" data-url="/openapi.yaml" />
      <Script
        src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"
        strategy="afterInteractive"
      />
    </>
  );
}
