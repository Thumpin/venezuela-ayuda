# Flujo de agentes: planear → ejecutar → verificar

> **Qué es esto.** Un flujo disciplinado para que los agentes de IA trabajen en
> `venezuela-ayuda` (Next.js en producción, PII real): **planear** antes de codear,
> **ejecutar** siguiendo el plan, **verificar** antes de cerrar. Implementado con subagentes
> de Claude Code y declarado en `AGENTS.md` para que **cualquier** agente lo siga.
>
> **Rigor.** Cada recomendación se ancla a fuente primaria con cita textual y pasó
> verificación adversarial de 3 votos. Investigación: 6 ángulos, 20 URLs, 126 afirmaciones
> extraídas, **66 confirmadas** (0 refutadas), 15 fuentes (14 primarias). Citas `[n]` →
> [§6 Fuentes](#6-fuentes). Consenso: **[3/3]** unánime · **[2/3]** un matiz.

---

## 1. El flujo

Para cualquier cambio **no trivial**, en vez de codear directo:

```
   /feature "<descripción>"
        │
   1. PLANNER ───▶ plan concreto (archivos, pasos, riesgos, cómo verificar)
        │
   2. EXECUTOR ──▶ implementa siguiendo el plan + tests   ◀─┐
        │                                                   │ si FAIL,
   3. VERIFIER ──▶ lint/build/test + diff vs reglas de oro ─┘ vuelve con el error
        │            PASS / FAIL (con evidencia)
        │
   4. Humano revisa el PR (responsable final)
```

**Por qué este patrón (y no algo más complejo):**
- Es el **prompt-chaining / orchestrator-workers** documentado por Anthropic: un LLM central
  descompone, delega y sintetiza [4] **[3/3]**. El encadenamiento secuencial "is ideal for
  situations where the task can be **easily and cleanly decomposed into fixed subtasks**" [4]
  **[3/3]** — por eso lo reservamos para cambios no triviales, no para todo.
- **Mantenerlo simple gana:** "the most successful implementations weren't using complex
  frameworks... they were building with **simple, composable patterns**" [4] **[3/3]**.

---

## 2. Los tres agentes (`.claude/agents/`)

Un subagente es **una instancia aislada de Claude con su propia ventana de contexto** [5]
**[3/3]**, su propio system prompt, permisos de tools y opcionalmente su modelo [5] **[3/3]**.
Se declara como Markdown con frontmatter YAML; **solo `name` y `description` son obligatorios**
[1] **[3/3]**.

| Agente | Rol | Tools | Modelo |
|---|---|---|---|
| `planner` | Diseña el plan; **no escribe** | Read, Grep, Glob, Bash | opus |
| `executor` | Implementa el plan + tests | Read, Edit, Write, Bash | opus |
| `verifier` | Corre gates + revisa diff; **no escribe** | Bash, Read, Grep | sonnet |

Diseño basado en evidencia:
- **Cada subagente necesita: objetivo, formato de salida, guía de tools y límites claros** [6]
  **[3/3]** — los tres archivos lo cumplen.
- El **`description` es lo que dispara la delegación** [2] **[3/3]**; escríbelo en tercera
  persona e incluye cuándo usarlo [3] **[3/3]**.
- **Verifier en contexto fresco:** corre criterios objetivos (lint/build/test). El patrón
  evaluator-optimizer "is particularly effective when we have **clear evaluation criteria**"
  [4] **[3/3]**, y conviene que el agente obtenga **"ground truth" del entorno en cada paso**
  (resultados de tests/ejecución) [4] **[3/3]**.

---

## 3. Por qué el executor implementa INLINE por defecto

Esta es la decisión de diseño más importante, y la evidencia es contundente:

- **"El único canal del padre al subagente es el string del prompt"** — el subagente **no
  recibe el historial de conversación ni los resultados de tools del padre** [2] **[3/3]**.
- **Cada subagente corre en una conversación fresca y solo su mensaje final vuelve al padre**
  [2] **[3/3]**; **los subagentes no pueden hablar entre sí** [5] **[3/3]**.

→ Por eso el comando `/feature` **implementa inline** (el agente principal, que tiene todo el
contexto del plan) y reserva el subagente `executor` para **sub-tareas acotadas y bien
especificadas** que convenga aislar. Si delegas al executor, **pásale el plan completo en el
prompt** (rutas, decisiones, errores) — no asumas que "se acuerda".

> Visión crítica (sana): hay quien argumenta **no construir multi-agentes** para tareas que
> dependen de contexto compartido, porque fragmentarlo degrada el resultado; la ingeniería de
> contexto es "**el trabajo #1**" al construir agentes [12] **[2/3]**. Nuestro flujo lo respeta:
> planificar/verificar se delega (tareas limpias), pero **ejecutar va inline**.

---

## 4. Cómo los agentes "conocen" el flujo

- **`AGENTS.md`** (fuente única) tiene una sección *planear → ejecutar → verificar* que
  **cualquier** agente lee (Claude/Cursor/Copilot/Codex). `CLAUDE.md` la importa con `@AGENTS.md`.
  Ojo: `CLAUDE.md` se carga **en cada sesión** [11] **[3/3]** → mantenerlo corto; el detalle va
  en docs.
- **Claude Code** automatiza el ciclo con el comando **`/feature`** (`.claude/commands/`), que
  invoca a `planner`/`executor`/`verifier`.
- Para encadenar subagentes basta pedírselo en secuencia: *"usa el planner… luego el verifier…"*
  [1] **[3/3]**.

> **Nota — comandos vs skills:** los comandos `.claude/commands/*.md` son el **formato legacy**;
> Anthropic recomienda **skills** (`.claude/skills/*/SKILL.md`) para nuevos workflows [8]
> **[3/3]**. Las skills **se cargan bajo demanda** (no inflan cada sesión) [11][15] **[3/3]** y
> también se invocan con `/name`; añade `disable-model-invocation: true` para que solo se
> disparen manualmente [9] **[3/3]**. `/feature` funciona hoy como comando; si el equipo migra a
> skill, el flujo es el mismo.

---

## 5. Cuándo usarlo, cuándo NO, y trampas

**Escala el flujo a la tarea** [6] **[3/3]** (Anthropic dimensiona el esfuerzo por complejidad:
fact-finding simple = 1 agente; comparaciones = 2-4; investigación compleja = 10+):
- **Cambio trivial** (typo, copy, fix de una línea): codea y verifica de una pasada.
- **No trivial / toca datos reales**: ciclo completo planner → executor → verifier.
- **Multi-agente NO** cuando la tarea no se descompone limpio o depende de todo el hilo [4][12].

**Trampas operativas verificadas (para que no te sorprendan):**
- **`name` único en todo el árbol:** si dos agentes comparten `name`, Claude Code **descarta uno
  sin avisar** [pitfalls] **[3/3]**.
- **Se cargan al inicio:** si creas/editar un agente con la sesión abierta, **reiníciala** para
  que cargue [2] **[3/3]**.
- **Paralelizar acelera:** correr subagentes en paralelo (no en serie) recortó tiempos hasta
  **90%** en el sistema multi-agente de Anthropic [6] **[3/3]** — útil para `planner`/búsquedas,
  no para pasos dependientes.
- **Hooks como gate duro:** un subagente verificador puede correr el linter tras cada edición con
  un hook `PostToolUse` (matcher `Edit|Write`) [1] **[3/3]** — barrera determinista, no consejo.
- Cambios pequeños en el prompt del agente líder **alteran de forma impredecible** a los
  subagentes [6] **[3/3]** → cambia las definiciones con cuidado y revisa el efecto.

---

## 6. Fuentes

Verificadas con extracción + cita textual + verificación adversarial de 3 votos.

1. Anthropic — *Claude Code: Subagents* — code.claude.com `[primaria]`
2. Anthropic — *Claude Agent SDK: Subagents* — code.claude.com `[primaria]`
3. Anthropic — *Agent Skills: Best practices* — platform.claude.com `[primaria]`
4. Anthropic — *Building effective agents* — anthropic.com/research `[primaria]`
5. Anthropic — *Subagents in Claude Code* — claude.com/blog `[primaria]`
6. Anthropic — *How we built our multi-agent research system* — anthropic.com/engineering `[primaria]`
7. Anthropic — *Claude Code: Slash commands* — code.claude.com `[primaria]`
8. Anthropic — *Claude Agent SDK: Overview* — code.claude.com `[primaria]`
9. Anthropic — *Claude Code: Skills* — code.claude.com `[primaria]`
10. Anthropic — *Managed agents / multi-agent* — platform.claude.com `[primaria]`
11. Anthropic — *Claude Code: Best practices* — code.claude.com `[primaria]`
12. Cognition — *Don't Build Multi-Agents* — cognition.com/blog `[blog, visión crítica]`
13. Anthropic — *Building agents with the Claude Agent SDK* — claude.com/blog `[primaria]`
14. Anthropic — *Using CLAUDE.md files* — claude.com/blog `[primaria]`
15. Anthropic — *Claude Code: Costs* — code.claude.com `[primaria]`

_Investigación: 6 ángulos · 20 URLs leídas · 126 afirmaciones extraídas · 66 verificadas
(3 votos c/u) · 0 refutadas · 15 fuentes (14 primarias)._
