# Observabilidad: logging de errores en servidor

Resuelve el [issue #37](https://github.com/mawmawmaw/venezuela-ayuda/issues/37):
antes, los fallos de servidor (caída de DB, timeout de una API externa, error de
Supabase) se tragaban en silencio y devolvían un mensaje genérico o un arreglo
vacío, sin rastro server-side. En Vercel eso hacía invisible una caída para quien
opera la app. Ahora todo fallo de servidor en `src/` deja una línea de log
estructurada y correlacionable.

## El logger: `src/lib/log.mjs`

Módulo puro (sin dependencias de Next/Supabase), testeado con `node --test`
(`scripts/log.test.mjs`), siguiendo la convención de `src/lib/apiPolicy.mjs`.

```js
import { logError, logWarn, logInfo, logDebug } from "@/lib/log.mjs";

logError("reports_write_failed", err, { scope: "api.reports.POST", request_id, table });
logWarn("external_fetch_failed", { scope: "data.missingPersonsApi", status: res.status });
logWarn("supabase_read_failed", { scope: "data.searchCheckins", view: "public_checkins" }, err);
```

### Niveles

| Función | Nivel | Consola | Cuándo |
|---|---|---|---|
| `logError` | `error` | `console.error` | Fallo de servidor que un operador debe ver (write/RPC falló, lookup 503). |
| `logWarn` | `warn` | `console.warn` | Degradación controlada con fallback (read vacío, API externa caída). |
| `logInfo` | `info` | `console.log` | Ciclo de vida de bajo volumen (NO por request). |
| `logDebug` | `debug` | `console.debug` | Diagnóstico. **No-op** salvo `LOG_LEVEL=debug` (o `DEBUG` truthy). |

### Contrato de salida

Una línea JSON por evento, p. ej.:

```json
{"level":"error","event":"reports_write_failed","name":"PostgrestError","code":"PGRST116","message":"...","scope":"api.reports.POST","request_id":"a1b2c3d4","table":"checkins","ts":"2026-06-27T12:00:00.000Z"}
```

Vercel la parsea en campos consultables; una alerta futura filtra por
`level`/`event`/`request_id`.

### Sin PII (regla dura)

- Se loguea sólo `err.message/name/code/digest` + un `context` con claves en
  allow-list (`scope`, `request_id`, `view`/`table`, `status`, contadores).
- NUNCA: cuerpos de request, campos de formulario, filas de Supabase, headers,
  IPs, `x-api-key`, teléfono/contacto, ni texto libre del usuario.
- `sanitizeContext` descarta claves del denylist (phone, contact, email, token,
  key, authorization, body, name, message, address, ip…) y objetos/arrays como
  red de seguridad — pero el call-site no debe depender de eso.
- Correlación por `request_id` (de `resolveRequestId`), nunca por el payload.

### Errores del cliente

`src/app/error.tsx` (error boundary, es un componente cliente) reenvía sólo el
`digest` (el hash de React, sin PII) a `POST /api/client-error`
(`src/app/api/client-error/route.ts`), que loguea server-side. Un `console.error`
del browser nunca llega a los logs de Vercel; este salto sí. NO se envía ni se
loguea `error.message`: puede traer texto libre del usuario o contenido
controlado por un atacante, y truncarlo no lo vuelve seguro; el `digest` basta
para agrupar el crash.

**Apagado por defecto.** El round-trip sólo opera con
`NEXT_PUBLIC_CLIENT_ERROR_LOGGING="true"`:

- El envío (en `error.tsx`) sólo hace el `fetch` si la bandera es `"true"`. Es
  `NEXT_PUBLIC` porque el error boundary es un componente cliente y la var se
  inlinea en el bundle en build time.
- La recepción (`/api/client-error`) respeta la MISMA bandera: si no es `"true"`,
  responde `204` sin loguear. Así, apagarla corta ambos lados del round-trip.
- Cambiar la bandera requiere un rebuild/redeploy (las `NEXT_PUBLIC_*` se fijan
  en build time).

### Variables de entorno

| Variable | Default | Efecto |
|---|---|---|
| `NEXT_PUBLIC_CLIENT_ERROR_LOGGING` | (off) | `"true"` activa el reporte de errores del cliente (envío + recepción). |
| `LOG_LEVEL` | (off) | `debug` activa las líneas de `logDebug`. |
| `DEBUG` | (off) | Truthy (≠ `""`/`"0"`/`"false"`) también activa `logDebug`. |

El logging server-side de `error`/`warn`/`info` está SIEMPRE activo; no se
configura.

## Alertas (pendiente, no se cablea hoy)

Los logs ya quedan *alert-ready*. Para encender alertas más adelante:

1. **Vercel Log Drain** → Logflare / Datadog / Better Stack, con una alerta sobre
   `level="error"` (o por `event`). Sin tocar código.
2. **Sentry**: `@sentry/nextjs` con instrumentación server + cliente; agrupa y
   alerta de fábrica. Cuesta una dependencia y un DSN/cuenta.

No se agregó ninguna dependencia ni cuenta en este cambio.
