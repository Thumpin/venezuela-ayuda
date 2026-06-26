import { createAuthenticator } from "@/lib/apiAuth.mjs";
import { getServerSupabase } from "@/lib/supabase/server";

// Auth por API key del hub, compartida por los endpoints de escritura (POST
// /reports y PATCH /reports/{id}). El autenticador vive a nivel de MÓDULO → su
// cache (key_hash → partner) se comparte entre ambos endpoints y sobrevive entre
// requests del mismo lambda. fetchByHash LANZA en error de DB (no devuelve null)
// para no cachear un fallo transitorio como miss.

export type Partner = { partnerId: string; source: string; scopes: string[] };

// createAuthenticator viene de un .mjs sin tipos → se anota explícitamente el
// shape del autenticador para no arrastrar `any`.
export const authenticatePartner: (apiKey: string | null) => Promise<Partner | null> =
  createAuthenticator(async (hash: string): Promise<Partner | null> => {
    const svc = getServerSupabase();
    const { data, error } = await svc
      .from("api_partners")
      .select("id, source, scopes")
      .eq("key_hash", hash)
      .eq("active", true)
      .is("revoked_at", null)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      partnerId: data.id as string,
      source: data.source as string,
      scopes: (data.scopes as string[]) ?? [],
    };
  });

// Metadata forense del request para el audit log (snapshot interno, nunca se
// expone por la lectura pública). ip = primer hop de x-forwarded-for (Vercel).
// El requestId se resuelve UNA vez en la ruta (resolveRequestId) y se inyecta
// acá, para que el mismo id vaya al audit_log y al header de respuesta.
export type RequestMeta = { requestId: string; ip: string | null; userAgent: string | null };

export function requestMeta(req: Request, requestId: string): RequestMeta {
  const h = req.headers;
  return {
    requestId,
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null,
    userAgent: h.get("user-agent"),
  };
}
