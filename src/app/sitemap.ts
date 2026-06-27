import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/share";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/a-salvo", "/buscar", "/necesito-ayuda", "/puedo-ayudar", "/mapa", "/ninos", "/reportar-nino"];
  return routes.map((r) => ({
    url: siteUrl(r),
    changeFrequency: "hourly",
    priority: r === "" ? 1 : 0.7,
  }));
}
