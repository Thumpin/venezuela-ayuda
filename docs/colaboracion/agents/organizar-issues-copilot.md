# Prompt para GitHub Agents: organizar issues

Usa este prompt en la pestaña **Agents** de GitHub cuando quieras que Copilot haga una pasada
de organización sobre issues abiertos.

## Importante: este prompt no se ejecuta solo

Este archivo es una receta para una sesión supervisada en la pestaña **Agents**. Guardarlo en el
repo ayuda a que cualquier maintainer use el mismo criterio, pero GitHub no lo ejecuta
automáticamente cuando alguien abre un issue.

Para triage automático en issues nuevos usamos el workflow
[`Issue triage agent`](../../../.github/workflows/issue-triage.yml), que corre en eventos
`issues: opened`, `edited` y `reopened`. Ese workflow es deliberadamente determinista: solo añade
labels mecánicas y deja `status:triaged`, asignaciones, cierres y comentarios sensibles a humanos.

Si GitHub habilita **Copilot Automations** para este repo en el futuro, un maintainer puede crear
una automatización desde **Agents -> Automations -> Create new**, elegir el trigger **When an issue
is created**, pegar este prompt y permitir solo las herramientas necesarias para leer issues,
actualizar labels y comentar. En repos públicos, revisa primero la disponibilidad actual de
Copilot Automations; no dependemos de eso para el flujo open source.

## Cómo usarlo manualmente

1. Abre la pestaña **Agents** del repo.
2. Pega el prompt completo de esta página.
3. Pide primero un `dry run` si quieres revisar la propuesta antes de aplicar labels.
4. Si el resultado está bien, permite labels y comentarios breves, pero no cierres ni asignaciones.
5. Revisa manualmente cualquier issue marcado `security` o `priority:p0`.

```text
Ayúdame a organizar los issues abiertos de este repo siguiendo las reglas del proyecto.

Lee primero, en este orden:
- CONTRIBUTING.md
- docs/colaboracion/gestion-de-issues.md
- .github/labels.yml
- .github/ISSUE_TEMPLATE/*.yml
- .github/CODEOWNERS
- SECURITY.md

Objetivo:
- Revisar issues abiertos que estén en `status:needs-triage` o que no tengan labels completas.
- Mantener la taxonomía: tipo (`bug`, `enhancement`, `documentation`, `question`), área (`area:*`), prioridad (`priority:*`) y estado (`status:*`).
- Ayudar a que los humanos sepan qué issues están listos para trabajar, cuáles necesitan más información y cuáles deben tratarse por seguridad.

Reglas duras:
- No expongas PII, teléfonos, contactos, tokens, keys, `manage_token`, datos privados ni payloads reales en comentarios o resúmenes.
- No pegues detalles de vulnerabilidades en comentarios públicos. Si un issue parece seguridad/PII, etiqueta `security` y `priority:p0`, deja un comentario breve pidiendo moverlo a reporte privado según SECURITY.md, y no repitas los detalles sensibles.
- No cierres issues salvo que el maintainer lo pida explícitamente. Para duplicados o inválidos, deja una recomendación y el enlace al posible duplicado.
- No marques `status:triaged` si falta información esencial, área o prioridad.
- No asignes personas si no hay una regla clara o una instrucción explícita.
- No cambies el contenido del issue salvo que sea estrictamente necesario; prefiere labels y comentarios breves.

Proceso:
1. Busca issues abiertos con `status:needs-triage`, sin `area:*`, sin `priority:*`, o sin tipo claro.
2. Para cada issue, revisa título, cuerpo, template usado y labels existentes.
3. Añade labels faltantes cuando sean obvias:
   - `area:ingesta`: API, hub, socios, reportes, OpenAPI, `x-api-key`.
   - `area:datos`: datos, deduplicación, clasificación, CSV, calidad de datos.
   - `area:fr`: reconocimiento facial, FR-API, rostro/cara.
   - `area:admin`: panel admin, moderación, colaboradores.
   - `area:ui`: mapa, vistas públicas, móvil, formularios, UX.
   - `area:db`: Supabase, Postgres, SQL, RLS, migraciones.
   - `area:ci`: GitHub Actions, Vercel, deploy, build, lint, staging.
4. Añade prioridad:
   - `priority:p0`: producción rota ahora, seguridad/PII, pérdida de datos, bloqueo crítico.
   - `priority:p1`: funcionalidad importante rota, migración DB, datos reales, no hay workaround claro.
   - `priority:p2`: bug o mejora normal, impacto medio.
   - `priority:p3`: menor, documentación, pregunta, UI interna o bajo riesgo.
5. Si el issue está claro, tiene tipo + área + prioridad y no necesita más info, puedes cambiar `status:needs-triage` a `status:triaged`.
6. Si falta información, deja `status:needs-triage` y comenta con una pregunta concreta.
7. Marca `good first issue` solo si el alcance es pequeño, no toca datos privados, no requiere secretos y el archivo/área probable está claro.
8. Marca `help wanted` si el issue está definido pero necesita voluntarios.

Entrega final:
- Resume cuántos issues revisaste.
- Lista qué labels agregaste por issue.
- Lista issues que quedaron bloqueados por falta de información.
- Lista posibles duplicados o cierres recomendados, sin cerrarlos.
- Lista cualquier issue de seguridad/PII detectado sin repetir detalles sensibles.
```

## Uso recomendado

- Primera pasada: pide un **dry run** si no quieres que el agente aplique labels todavía.
- Pasada operativa: permite labels y comentarios, pero no cierres ni asignaciones automáticas.
- Después de la sesión: revisa el resumen del agente y confirma manualmente los casos sensibles.
