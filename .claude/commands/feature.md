---
description: Cicla planner → executor → verifier para implementar un cambio de forma disciplinada en venezuela-ayuda.
argument-hint: <descripción del cambio>
---

# Feature: $ARGUMENTS

Orquesta el flujo de agentes de `venezuela-ayuda`. Sigue los pasos **en orden** y **no te
saltes el gate de verificación**. Lee `AGENTS.md` antes de empezar.

## 1. Planear
Lanza el subagente **`planner`** con la descripción `$ARGUMENTS`. Pídele el plan concreto:
archivos a tocar, pasos, riesgos/Ask-first, cómo verificar y tests a añadir.
- Si el plan tiene **decisiones de producto abiertas**, pregúntaselas al usuario **antes** de
  implementar.
- Si el cambio toca algo **Ask-first** (migraciones, `fr.ts`, `admin/`, deps, prod), confirma
  con el usuario.

## 2. Implementar
Implementa siguiendo el plan y las **reglas de oro** de `AGENTS.md` (PII fuera de logs/vistas
públicas; sin secretos; migraciones por timestamp; cambios pequeños).
- **Por defecto, implementa inline** (el agente principal, con todo el contexto del plan).
- Usa el subagente **`executor`** solo para sub-tareas acotadas y bien especificadas que
  convenga aislar.
- Escribe los tests en la misma iteración.

## 3. Verificar (gate — no lo saltes)
Lanza el subagente **`verifier`** sobre el diff (`git diff`). Debe dar **PASS**: `lint`,
`build` y `test` en verde **y** sin hallazgos 🔴 (PII, secretos, tests borrados).
- Si da **FAIL**, vuelve al paso 2 con el error/hallazgo exacto y repite.
- PII o secretos = FAIL automático.

## 4. Cerrar
Resume lo hecho con la evidencia del verifier. **No commitees** salvo que el usuario lo pida;
cuando lo pida, conventional commits y PR contra **`staging`** (un humano revisa y es
responsable).

> Escala el flujo a la tarea: para cambios triviales, planear+verificar puede ser de una sola
> pasada; reserva el ciclo completo para cambios no triviales o que tocan datos reales.
