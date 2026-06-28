# Cómo contribuir a venezuela-ayuda

Gracias por sumarte. Esto es una app **en producción** para respuesta a una emergencia:
lo que mergeamos afecta a personas reales. Por eso priorizamos **velocidad con frenos** —
moverse rápido, pero con barreras que impidan romper prod.

Lee esto una vez antes de tu primer PR. Toma 5 minutos y te ahorra rebotes.

> Documentación ampliada en [`docs/colaboracion/`](docs/colaboracion/): mejores prácticas
> (con fuentes), estrategia de ramas, gestión de migraciones y gobernanza.
>
> 💬 **¿Dónde preguntar?** Cada área tiene su canal de chat — ver
> [`canales-de-comunicacion.md`](docs/colaboracion/canales-de-comunicacion.md). Recuerda: las
> decisiones y el trabajo se rastrean en **issues/PRs**, no en el chat.

## 🚪 Punto de entrada: empieza por los issues

**No abras un PR de la nada.** El punto de entrada para contribuir son los **issues**:

1. **Revisa los issues abiertos** → https://github.com/mawmawmaw/venezuela-ayuda/issues
   ¿Primera vez? Filtra por la etiqueta **`good first issue`**.
2. **Pide que te asignen el issue** — comenta en él que quieres tomarlo y espera la
   asignación (evita que dos personas trabajen lo mismo). No empieces a programar hasta
   estar asignado.
3. **Trabaja solo issues `status:triaged`** (ya clasificados y listos). Si lo que quieres
   hacer no tiene issue, **abre uno primero** con la [plantilla](.github/ISSUE_TEMPLATE/)
   y espera el triage.
4. **Una vez asignado**, sigue el [flujo de trabajo](#flujo-de-trabajo-issue--staging--qa--main).

El `Issue triage agent` puede poner labels mecánicas (`area:*`, `priority:*`, `security`),
pero **no reemplaza al triager humano**: espera `status:triaged` antes de empezar.

> ¿Por qué? Con muchos colaboradores, el issue es lo que coordina quién hace qué, evita
> trabajo duplicado y deja decidir **antes** de invertir esfuerzo. Un PR sin issue asignado
> probablemente se cierre pidiendo que pases por aquí primero.

## Reglas de oro (no negociables)

1. **Nunca pushees directo a `main` ni a `staging`.** Todo entra por Pull Request.
2. **`main` = PRODUCCIÓN.** Solo recibe merges desde `staging`.
3. **El CI manda.** Si lint/build/tests/migraciones fallan, no se mergea. No se saltan checks.
4. **PRs pequeños.** Un PR = un cambio lógico. Si no se revisa en 10 min, es muy grande.
5. **Cuidado con prod y con datos personales.** Nada de PII en logs ni en endpoints públicos.
   Ante la duda con datos reales, pregunta antes de actuar.

## Setup rápido

```bash
git clone <repo> && cd venezuela-ayuda
npm install
cp .env.example .env.local   # pide los valores al equipo (nunca subas .env*)
npm run dev
```

Antes de abrir un PR, en local debe pasar:

```bash
npm run lint
npm run build
node --test            # tests de lógica pura (.mjs)
```

### Gestor de paquetes

**npm es el estándar del repo.** El lockfile versionado es `package-lock.json` y
es el que usan CI y Vercel — manténlo en sync.

Puedes usar **otro gestor en local** (pnpm, yarn, bun) para tu desarrollo: sus
lockfiles (`pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`) están en `.gitignore`, así
que no se suben. Reglas para no romper el lockfile canónico:

- **No** subas un lockfile que no sea `package-lock.json`.
- **No** agregues el campo `packageManager` a `package.json`.
- Si **agregas o cambias dependencias**, corre `npm install` y commitea el
  `package-lock.json` actualizado junto con el cambio en `package.json`.

## Flujo de trabajo (issue → staging → QA → main)

El ciclo completo, de principio a fin:

```
issue (asignado)  ──▶  feat/<área>/<desc>  ──PR──▶  staging  ──QA──▶  main (PROD)
   punto de             rama de trabajo      revisión   prueba en      promoción
   entrada                                   + CI       staging        (maintainer)
```

1. **Toma un issue asignado** (ver [Punto de entrada](#-punto-de-entrada-empieza-por-los-issues)).
2. **Crea una rama** desde `staging`:
   `git checkout staging && git pull && git checkout -b feat/ingesta/validar-coords`
   - Convención: `feat|fix|docs|chore/<área>/<descripción-corta>`.
   - Áreas: `ingesta`, `dedup`, `fr`, `admin`, `mapa`, `db`, `ci`, `ui`.
3. **Haz commits pequeños** en conventional commits: `feat(ingesta): rechazar request sin coords`.
   Enlaza el issue en el PR (`Closes #123`).
4. **Abre el PR contra `staging`** (NUNCA contra `main`). Llena la plantilla.
5. **El CODEOWNERS del área** revisa. Resuelve los comentarios; no se mergea con hilos abiertos.
6. **Mergea a `staging`** cuando esté aprobado y el CI verde.
7. **QA en staging** (ver abajo) — un responsable de QA valida el cambio en el entorno de
   staging. Hasta que QA aprueba, el cambio **no está listo para producción**.
8. **Promoción a prod:** un **maintainer** abre PR `staging → main` (doble aprobación) tras la
   ronda de QA. Solo los maintainers promueven a `main`.

### QA en staging (gate antes de producción)

`main` es producción para una emergencia: nada llega ahí sin pasar por QA en staging.

- **Modelo mixto:**
  - **Por cada PR** — al mergear a `staging`, el responsable de QA valida ese cambio en el
    entorno de staging (no solo "compila": que **funcione** con datos de staging).
  - **Ronda integrada antes de promover** — antes de cada PR `staging → main`, QA hace una
    verificación del **conjunto** que va en staging (que los cambios no se rompan entre sí).
- **Responsables de QA / testing en staging:** **@mawmawmaw/equipo-qa** _(⚠️ reemplazar por los
  @handles reales del equipo de QA)_. Son quienes dan el visto bueno de QA y sin su aprobación
  no se promueve a `main`.
- **Si encuentras un bug en QA:** ábrele un issue (o repórtalo en el PR), etiqueta
  `status:blocked` si frena la promoción, y vuelve al flujo desde el issue.

> Roles y cómo se gana cada uno (incluido QA y maintainer): [`gobernanza.md`](docs/colaboracion/gobernanza.md).

### ¿Rama o fork?

- **Si tienes acceso de escritura** (equipos/colaboradores de confianza): trabaja en ramas
  dentro del repo.
- **Si eres colaborador externo nuevo**: haz **fork + PR**. Tras varias contribuciones de
  calidad se evalúa darte acceso (ver [gobernanza](docs/colaboracion/gobernanza.md)).

## Revisión de código

- Cada PR necesita aprobación del **Code Owner** del área que toca (ver
  [`.github/CODEOWNERS`](.github/CODEOWNERS)).
- `staging`: 1 aprobación. `main`: 2 aprobaciones.
- El revisor mira **lógica y seguridad**, no estilo (de eso se encarga el linter).
- Sé amable y concreto. Asume buena fe — mucha gente aquí es voluntaria.

## Migraciones de base de datos ⚠️

El mayor riesgo con muchos colaboradores. **Lee
[`gestion-de-migraciones.md`](docs/colaboracion/gestion-de-migraciones.md) antes de tocar
`supabase/migrations/`.** En resumen:

- Una migración nueva va en `supabase/migrations/` con **nombre por timestamp**
  (`YYYYMMDDHHMM_descripcion.sql`), no con número secuencial, para evitar colisiones.
- Cada migración debe ser **idempotente** (`if not exists`, `on conflict do nothing`) y no
  dejar el esquema roto si corre sola.
- Cambios destructivos en prod: patrón **expand → migrate → contract** (nunca borres en la
  misma migración que añades).
- El CI valida que todas las migraciones apliquen sobre una DB limpia.

## Issues

- ¿Empezando? Busca la etiqueta **`good first issue`**.
- Reporta bugs y propone features con las [plantillas](.github/ISSUE_TEMPLATE/).
- Para coordinar, comenta en el issue antes de empezar a trabajarlo (evita trabajo duplicado).
- Cómo se clasifican y trabajan los issues (triage, labels, board):
  [`gestion-de-issues.md`](docs/colaboracion/gestion-de-issues.md).

## Decisiones de arquitectura

Cambios estructurales se documentan como **ADR** (un archivo por decisión). Mira el formato
en [`docs/colaboracion/gobernanza.md`](docs/colaboracion/gobernanza.md#adrs).

## Seguridad

¿Encontraste una vulnerabilidad o una fuga de PII? **No abras un issue público.** Sigue
[`SECURITY.md`](SECURITY.md) (o escribe en privado al equipo de mantenimiento).
