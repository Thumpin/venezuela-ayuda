"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Reporta el error al servidor para que aparezca en los logs de Vercel (un
  // console.error del cliente sólo llega al browser). Sólo enviamos `digest` (el
  // hash de React, sin PII) — nunca el message, el stack ni datos del usuario:
  // error.message puede traer texto libre del usuario o contenido controlado por
  // un atacante. Best-effort: si falla, ni modo.
  //
  // Gated por NEXT_PUBLIC_CLIENT_ERROR_LOGGING="true": el reporte de errores del
  // cliente está APAGADO por defecto. La var es NEXT_PUBLIC porque este es un
  // componente cliente (se inlinea en el bundle en build time). El endpoint
  // server-side respeta la misma bandera, así que apagarla corta todo el round-trip.
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_CLIENT_ERROR_LOGGING !== "true") return;
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ digest: error.digest }),
      keepalive: true,
    }).catch(() => {});
  }, [error]);

  return (
    <main className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <div aria-hidden className="text-5xl">⚠️</div>
      <h1 className="mt-3 text-2xl font-extrabold text-slate-900">Algo salió mal</h1>
      <p className="mt-2 text-slate-600">
        Ocurrió un error. Revisa tu conexión e intenta de nuevo.
      </p>
      <div className="mt-6 flex gap-2">
        <button
          onClick={reset}
          className="rounded-xl bg-slate-900 px-5 py-3 font-bold text-white"
        >
          Reintentar
        </button>
        <Link href="/" className="rounded-xl bg-white px-5 py-3 font-bold text-slate-700 ring-1 ring-slate-300">
          Inicio
        </Link>
      </div>
    </main>
  );
}
