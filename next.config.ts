import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { SECURITY_HEADERS, API_SECURITY_HEADERS, API_CORS_HEADERS } from "./src/lib/apiPolicy.mjs";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  experimental: {
    // Photos are downscaled client-side (~150-400 KB) but leave headroom.
    serverActions: { bodySizeLimit: "3mb" },
  },
  images: {
    remotePatterns: [
      // Public Supabase Storage (check-in / missing-person photos).
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
    ],
  },
  // Security headers que Vercel NO pone automático. HTTPS-redirect (308) y HSTS
  // base los da la plataforma; acá reforzamos lo que falta. Globales = seguros
  // también para el sitio HTML; el lockdown de Permissions-Policy va sólo a /api.
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      { source: "/api/:path*", headers: API_SECURITY_HEADERS },
      // CORS del API público v1. El split lectura/escritura lo enforza el browser
      // (preflight), no nuestro código — ver API_CORS_HEADERS en apiPolicy.mjs.
      { source: "/api/v1/:path*", headers: API_CORS_HEADERS },
    ];
  },
};

export default withNextIntl(nextConfig);
