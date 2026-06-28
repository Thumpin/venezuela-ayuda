# Fix: Error de Edge Runtime al importar `node:crypto` en middleware

## Contexto

Al implementar la corrección de la CSP ausente en producción (ver
`csp-and-map-tile-fix.md`), el middleware importaba `contentSecurityPolicy`
directamente desde `apiPolicy.mjs`. Esto generó el siguiente error en el
servidor de desarrollo:

```
⚠ ./src/lib/apiPolicy.mjs:5:1
A Node.js module is loaded ('node:crypto' at line 5) which is not supported
in the Edge Runtime.

Import trace:
  Edge Middleware:
    ./src/lib/apiPolicy.mjs
    ./middleware.ts
```

---

## Causa raíz

### Qué es el Edge Runtime

Next.js ejecuta el middleware en el **Edge Runtime**, un entorno de ejecución
más liviano que el runtime estándar de Node.js. Está diseñado para correr en
CDNs distribuidas globalmente (como la red edge de Vercel) con latencias muy
bajas. Por esa razón, solo soporta un subconjunto de las APIs de Node.js —
específicamente, no soporta módulos nativos de Node como `node:crypto`,
`node:fs`, `node:path`, etc.

### Por qué `apiPolicy.mjs` es incompatible

`apiPolicy.mjs` tiene esta importación al inicio del archivo:

```js
import { randomUUID } from "node:crypto";
```

Esta línea existe para la función `resolveRequestId`, que genera IDs de tracing
para el `audit_log`. No tiene ninguna relación con la CSP, pero al estar en el
mismo archivo, cuando el middleware importa `contentSecurityPolicy` desde
`apiPolicy.mjs`, Node.js carga el archivo completo — incluyendo la importación
de `node:crypto` — y el Edge Runtime falla.

### Por qué se usaba `apiPolicy.mjs` en primer lugar

En la corrección anterior, `contentSecurityPolicy` se importó desde
`apiPolicy.mjs` porque ya estaba definida ahí y era el único lugar donde
existía. No se anticipó que ese archivo tuviera dependencias incompatibles con
el Edge Runtime.

---

## La solución — tres cambios

### 1. Nuevo archivo `src/lib/csp.mjs`

Se creó un archivo nuevo que contiene **únicamente** los directives de CSP y
la función `contentSecurityPolicy`. No tiene ninguna importación:

```js
// Edge-runtime-safe: no Node.js imports.
const CSP_DIRECTIVES = {
  "default-src": ["'self'"],
  "base-uri": ["'self'"],
  ...
};

export function contentSecurityPolicy() {
  const body = Object.entries(CSP_DIRECTIVES)
    .map(([k, v]) => `${k} ${v.join(" ")}`)
    .join("; ");
  return `${body}; upgrade-insecure-requests`;
}
```

Al no tener importaciones, este archivo es completamente seguro para el Edge
Runtime. La regla es simple: cualquier archivo importado por el middleware
(directa o indirectamente) no puede usar módulos de Node.js.

### 2. `src/lib/apiPolicy.mjs` — reemplaza la definición por un re-export

En lugar de duplicar los directives de CSP, `apiPolicy.mjs` ahora simplemente
re-exporta la función desde el nuevo archivo:

**Antes** — `apiPolicy.mjs` tenía toda la lógica de CSP (~50 líneas):

```js
const CSP_DIRECTIVES = {
  "default-src": ["'self'"],
  ...
};

export function contentSecurityPolicy() {
  ...
}
```

**Después** — una sola línea:

```js
export { contentSecurityPolicy } from "./csp.mjs";
```

Esto mantiene la compatibilidad con `next.config.ts`, que importa
`contentSecurityPolicy` desde `apiPolicy.mjs` y no necesita cambios. La fuente
de verdad de los directives ahora vive en un único lugar (`csp.mjs`), evitando
que puedan quedar desincronizados.

### 3. `middleware.ts` — cambia el origen de la importación

**Antes:**

```ts
import { contentSecurityPolicy } from "./src/lib/apiPolicy.mjs";
```

**Después:**

```ts
import { contentSecurityPolicy } from "./src/lib/csp.mjs";
```

El middleware ahora importa directamente desde `csp.mjs`, saltándose
`apiPolicy.mjs` y su dependencia en `node:crypto` por completo.

---

## Diagrama del flujo de importaciones

**Antes (roto):**

```
middleware.ts
    └── apiPolicy.mjs   ← carga node:crypto → falla en Edge Runtime
            └── node:crypto ✗

next.config.ts
    └── apiPolicy.mjs   ← ok (corre en Node.js, no Edge Runtime)
```

**Después (correcto):**

```
middleware.ts
    └── csp.mjs         ← sin importaciones → Edge Runtime compatible ✓

next.config.ts
    └── apiPolicy.mjs
            └── csp.mjs (re-export)

apiPolicy.mjs
    └── node:crypto     ← sigue aquí, pero el middleware ya no lo toca
    └── csp.mjs
```

---

## Verificación

Al correr `npm run build`, el warning de Edge Runtime debe desaparecer:

```
✓ Compiled successfully
```

Y al inspeccionar los headers de respuesta en `http://localhost:3000`:

```
content-security-policy: default-src 'self'; ...   ← presente
```
