import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { FR_BASE, frHeaders, frConfigured, FR_SOURCE } from "@/lib/fr";

// Depuración: cruza NUESTRA propia base por rostro y lista posibles duplicados.
// SOLO admin.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ ok: false, error: "no_autorizado" }, { status: 401 });
  if (!frConfigured())
    return NextResponse.json({ ok: false, error: "FR no configurado" }, { status: 503 });

  const u = new URL(req.url);
  const min = u.searchParams.get("min_score") || "0.6";
  const limit = u.searchParams.get("limit") || "300";
  try {
    const r = await fetch(
      `${FR_BASE}/v1/duplicates?source=${encodeURIComponent(FR_SOURCE)}&min_score=${min}&limit=${limit}`,
      { headers: frHeaders() },
    );
    return new NextResponse(await r.text(), {
      status: r.status,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "No se pudo conectar con el FR-API." }, { status: 502 });
  }
}
