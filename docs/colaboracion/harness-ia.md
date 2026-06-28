# Harness y guardrails para agentes de IA

> **Qué es esto.** Con muchos colaboradores usando **Claude Code, Cursor, GitHub Copilot y
> Codex**, este documento define el **harness** (las instrucciones que la IA lee para saber
> qué hacer, cómo y cómo verificarlo) y los **guardrails** (qué puede/no puede hacer, y las
> barreras que se hacen cumplir). Aterrizado a `venezuela-ayuda`: Next.js **en producción**
> para una emergencia, con **PII real**.
>
> **Rigor.** Cada recomendación se ancla a fuente primaria con **cita textual** y pasó
> verificación adversarial de **3 votos**. Investigación: 6 ángulos, 22 URLs, 122 afirmaciones
> extraídas, **66 verificadas y confirmadas** (0 refutadas), 17 fuentes (15 primarias). Citas
> `[n]` → [§7 Fuentes](#7-fuentes). Consenso: **[3/3]** unánime · **[2/3]** un matiz.

---

## 1. La idea: una fuente de verdad, varias herramientas

Cada herramienta de IA lee su propio archivo de instrucciones, lo que invita a **drift** (que
las reglas de Claude digan una cosa y las de Cursor otra). La solución es **un archivo
canónico y que los demás apunten a él**.

- **`AGENTS.md` es el estándar abierto** que leen Cursor, Copilot y Codex; va en la **raíz del
  repo** [1] **[3/3]** y **complementa al README** (el README es para humanos; AGENTS.md es el
  contexto que el agente necesita) [1] **[3/3]**.
- **Claude Code** lee `CLAUDE.md`, pero soporta importar con `@ruta` (hasta 4 niveles) [5]
  **[3/3]** → nuestro `CLAUDE.md` es una línea: `@AGENTS.md`. Sin duplicar.
- **Cursor** usa `.cursor/rules/*.mdc` versionados [9] **[3/3]**; los `alwaysApply` se inyectan
  **al inicio del contexto** [9] **[3/3]**. Nuestra regla apunta a `AGENTS.md`. (Cursor además
  ya combina `AGENTS.md` anidados, con precedencia del más específico [9] **[3/3]**.)
- **Copilot** usa `.github/copilot-instructions.md` → también apunta a `AGENTS.md`.
- **Codex** concatena los `AGENTS.md` desde la raíz hacia abajo [3] **[3/3]**.

**Precedencia (útil saberla):** gana el `AGENTS.md` **más cercano** al archivo editado, y los
**prompts explícitos del usuario en el chat anulan todo** [2] **[3/3]**. Por eso ponemos uno
en la raíz; si una subcarpeta necesita reglas propias, se le añade su `AGENTS.md`.

Archivos de este repo (en el PR):

| Archivo | Rol |
|---|---|
| **`AGENTS.md`** (raíz) | **Fuente única de verdad** |
| `CLAUDE.md` | Una línea: `@AGENTS.md` (+ notas Claude) |
| `.github/copilot-instructions.md` | Puntero a `AGENTS.md` |
| `.cursor/rules/proyecto.mdc` | Regla `alwaysApply` → `AGENTS.md` |
| `.claude/settings.json` | **Guardrail duro**: permisos deny/ask |

---

## 2. Cómo escribir el harness (context engineering)

El instinto de "ponerle TODO el contexto" es contraproducente:

- **Existe el *context rot*:** a más tokens en la ventana, **peor recuerda** el modelo la
  información [12] **[3/3]**. Más no es mejor.
- **Busca el mínimo suficiente:** "the minimal set of information that fully outlines your
  expected behavior" [12] **[3/3]** — ni exhaustivo ni vago.
- **Sé específico con el stack:** "React 18 with TypeScript, Vite, Tailwind", no "React
  project" [15] **[3/3]**.
- **Mantén los archivos cortos.** Hay límites reales de carga: Codex corta el conjunto de
  AGENTS.md a **32 KiB** (`project_doc_max_bytes`) [3] **[3/3]**; Cursor recomienda reglas
  **<500 líneas** [8] **[3/3]**; Claude carga al inicio solo las primeras **200 líneas / 25 KB**
  de memoria [5] **[3/3]**. → detalle largo se **enlaza**, no se pega (por eso `AGENTS.md`
  apunta a `docs/`).
- **Referencia archivos en vez de copiarlos:** Cursor permite `@archivo.ts` dentro de una regla
  [8] **[3/3]**; Claude importa con `@ruta` [5].

---

## 3. Verificación: que la IA compruebe su trabajo

El harness no solo dice *qué* hacer, sino *cómo verificar* — y eso cambia el comportamiento:

- **Listar los comandos de test hace que el agente los corra.** "if you list them. The agent
  will attempt to execute relevant programmatic checks and **fix failures before finishing**"
  [1] **[3/3]**. Por eso `AGENTS.md` lista `lint`/`build`/`test` como gate previo.
- **Revisor en contexto fresco.** Un revisor en un subagente nuevo "sees only the diff and the
  criteria, not the reasoning that produced the change" → lo juzga por sí mismo [11] **[3/3]**.
  Útil: pídele a la IA que **se autorevise en una pasada limpia** antes de abrir el PR.
- **Revisión multi-agente** (cómo lo hace el propio code review de Claude): varios agentes en
  paralelo buscan bugs, **verifican para filtrar falsos positivos** y ordenan por severidad
  [16] **[3/3]**.
- **El humano sigue siendo responsable.** Exige **verificación humana antes de ejecutar código
  generado por IA con privilegios elevados** [14-owasp] **[3/3]**; CoSAI exige **salidas finales
  revisadas/editadas por humanos** [13-cosai] **[3/3]**. → todo cambio de IA va por **PR con
  revisión humana** (encaja con el flujo de [`estrategia-de-ramas-y-proteccion.md`](./estrategia-de-ramas-y-proteccion.md)).

---

## 4. Guardrails: las barreras que SÍ se hacen cumplir

Distinción crítica: **el texto del harness es consultivo, no un control.**

- `CLAUDE.md`/AGENTS.md "is delivered as a user message... **no guarantee of strict
  compliance**" [13-mem] **[3/3]**. Claude "reads it and tries to follow it" — nada más.
- **Para bloquear de verdad, usa hooks/permisos:** "To block an action regardless of what
  Claude decides, use a **PreToolUse hook**" [13-mem] **[3/3]**. "Unlike CLAUDE.md instructions
  which are advisory, **hooks are deterministic and guarantee the action happens**" [4] **[3/3]**.

Así que combinamos las dos capas:

**a) Reglas en lenguaje claro** (en `AGENTS.md`) con tres categorías [15] **[3/3]**:
**Always do / Ask first / Never do**. Matices verificados que vale codificar:
- Declara explícitamente **qué no tocar nunca**: secretos, `vendor/`, configs de producción
  [15] **[3/3]**.
- Distingue permiso **por acción sobre la misma carpeta**: puede *escribir* tests pero **nunca
  borrar un test porque está fallando** [15] **[3/3]**.
- Prohíbe **commitear secretos/API keys y editar `node_modules`/`vendor`** [15] **[3/3]**.
- Deploys/acciones sensibles: **solo a dev y con aprobación explícita** [15] **[2/3]**.

**b) Barreras duras** (se hacen cumplir, no dependen del modelo):
- **Permisos `deny`/`ask`** en `.claude/settings.json` (incluido en el PR): negar lectura de
  `.env*`, `rm -rf`, `--force`, `--no-verify`, `db reset`; pedir confirmación para push, deps,
  migraciones, `fr.ts`, `admin/`. Base verificada: Claude **solo escribe en su carpeta y
  subcarpetas** [security] **[3/3]**; los comandos no listados **piden aprobación por defecto
  (fail-closed)** y los sospechosos la piden **aun estando en allowlist** [security] **[3/3]**;
  `curl`/`wget` **no se auto-aprueban** [security] **[3/3]**.
- **Hooks** (opcional, potente): un `Stop` hook corre tu check (p. ej. `lint`) y **bloquea el
  fin del turno hasta que pase** (Claude lo anula tras 8 bloqueos seguidos) [4] **[3/3]**; el
  JSON del hook solo se procesa con **exit 0** [hooks] **[3/3]**. Útil para forzar
  "no termines hasta que el lint pase".
- **Sandboxing** para correr agentes con menos fricción y más seguridad: requiere **aislar
  sistema de archivos *y* red** (no uno solo) [sandbox] **[3/3]**, construido sobre primitivas
  del SO (bubblewrap/seatbelt) [sandbox] **[3/3]**. Los cloud agents corren en sandboxes
  remotos [7] **[3/3]**.

> ⚠️ **Modo no interactivo (`-p`)**: la verificación de confianza se **desactiva** con `-p`
> [security] **[3/3]** y el modo auto **aborta si el clasificador bloquea repetidamente** (no
> hay humano a quien preguntar) [4] **[3/3]**. → en CI/automatización, no dependas de la
> aprobación interactiva; usa permisos `deny` explícitos.

---

## 5. Seguridad con datos sensibles (esta app maneja PII)

- **El harness debe prohibir explícitamente exponer PII y secretos** (en `AGENTS.md`). Recuerda
  que es consultivo → respáldalo con `deny` de lectura de `.env*` y revisión humana.
- **Prompt injection / contenido hostil:** el modo auto de Claude usa un **clasificador que
  bloquea escalada de alcance, infra desconocida y acciones impulsadas por contenido hostil**
  [4] **[3/3]**. Aun así, **no confíes solo en el modelo**.
- **Riesgo de encadenar herramientas:** aunque cada API restrinja, un agente puede **encadenar
  tools para burlar controles** (p. ej. sacar datos por una API externa y meterlos en una
  respuesta visible) [14-owasp] **[3/3]** → **mínimo privilegio**: concede solo las tools
  necesarias [owasp-cheat] **[3/3]**, y tools de **propósito acotado** (ejecutar un *prepared
  statement*, no SQL arbitrario); su implementación **no debe delegar en el LLM** la validación
  ni el cumplimiento de restricciones [cosai] **[3/3]**.
- **MCP:** trátalo con el mismo cuidado — las llamadas a tools deberían pasar por **proxies que
  apliquen política de red/archivos e inspeccionen retornos antes de entrar al contexto** [how-we-contain] **[3/3]**.
- **Política a nivel organización:** los `CLAUDE.md` de *managed policy* **no se pueden excluir**
  por configuraciones individuales [13-mem] **[3/3]** — útil si se quiere imponer reglas a todo
  el equipo de forma central.

---

## 6. Recomendaciones accionables (resumen)

1. **Adoptar `AGENTS.md` como fuente única** + punteros (CLAUDE.md, copilot, cursor). *(En el PR.)*
2. **Listar `lint`/`build`/`test`** en el harness como gate de "verifica antes de terminar". *(En el PR.)*
3. **Guardrails Always/Ask/Never** en lenguaje claro + **`deny`/`ask` duros** en
   `.claude/settings.json`. *(En el PR.)*
4. **Todo cambio de IA por PR con revisión humana** — encaja con la protección de ramas ya
   propuesta. Considera pedir auto-revisión en contexto fresco antes del PR.
5. **Mantener los archivos cortos** y enlazar el detalle (límites de carga reales).
6. **Para automatización/CI:** permisos `deny` explícitos (la aprobación interactiva no aplica
   con `-p`); considera **hooks** (`Stop` para forzar lint, `PreToolUse` para bloquear) y
   **sandbox** (fs + red).
7. **Adoptar `Co-authored-by:`** cuando humano+IA co-escriben (con el email de la cuenta de
   GitHub para que cuente) [coauthor] **[3/3]**.

---

## 7. Fuentes

Verificadas con extracción + cita textual + verificación adversarial de 3 votos.

**Estándar de archivos de instrucciones**
1. *AGENTS.md — open standard* — agents.md `[primaria]`
2. *AGENTS.md FAQ (precedencia/overrides)* — agents.md `[primaria]`
3. OpenAI — *Codex: AGENTS.md guide* — developers.openai.com `[primaria]`
4. Anthropic — *Claude Code best practices* — code.claude.com `[primaria]`
5. Anthropic — *Claude Code memory (CLAUDE.md)* — code.claude.com `[primaria]`
8. Cursor — *Rules* — cursor.com/docs `[primaria]`
9. Cursor — *Rules (project rules / .mdc)* — cursor.com/docs `[primaria]`
7. Cursor — *Agent best practices* — cursor.com/blog `[primaria]`

**Context engineering**
12. Anthropic — *Effective context engineering for AI agents* — anthropic.com `[primaria]`
15. GitHub — *How to write a great AGENTS.md (2500+ repos)* — github.blog `[blog]`

**Guardrails / seguridad / sandbox**
- Anthropic — *Claude Code security* — code.claude.com `[primaria]`
- Anthropic — *Claude Code sandboxing* — anthropic.com `[primaria]`
- Anthropic — *How we contain Claude* — anthropic.com `[primaria]`
- Anthropic — *Claude Code hooks* — code.claude.com `[primaria]`
- OWASP — *AI Agent Security Cheat Sheet* — cheatsheetseries.owasp.org `[primaria]`
- OWASP GenAI — *Agentic AI: threats and mitigations* — genai.owasp.org `[primaria]`
- CoSAI — *MCP security / secure design of agentic systems* — github.com/cosai-oasis `[primaria]`

**Revisión / procedencia**
16. Anthropic — *Claude code review* — claude.com/blog `[primaria]`
- GitHub Docs — *Creating a commit with multiple authors* `[primaria]`

_Investigación: 6 ángulos · 22 URLs leídas · 122 afirmaciones extraídas · 66 verificadas
(3 votos c/u) · 0 refutadas · 17 fuentes (15 primarias)._
