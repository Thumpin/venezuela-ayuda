# Gestión de issues (triage, labels y board)

Cómo entran, se clasifican y se trabajan los issues con muchos colaboradores. Fundamento:
[`00-mejores-practicas-colaboracion.md`](./00-mejores-practicas-colaboracion.md) §6.

## Plantillas

Al abrir un issue se elige una plantilla (issues en blanco están deshabilitados):
- **🐞 Reporte de bug** (`.github/ISSUE_TEMPLATE/bug_report.yml`) — captura entorno, área y severidad.
- **✨ Propuesta de mejora** (`feature_request.yml`) — captura área e impacto.
- **🔐 Seguridad / PII** y **💬 Dudas** → enlaces (no abren issue público), ver `config.yml`.

Las plantillas aplican automáticamente `status:needs-triage` + el tipo (`bug`/`enhancement`).

## Taxonomía de labels

Fuente de verdad: [`.github/labels.yml`](../../.github/labels.yml). Cuatro ejes ortogonales —
un issue bien clasificado tiene **uno de cada**:

| Eje | Labels | Quién la pone |
|---|---|---|
| **Tipo** | `bug` · `enhancement` · `documentation` · `question` | La plantilla / quien abre |
| **Área** | `area:{ingesta,datos,fr,admin,ui,db,ci}` | Triager (según el desplegable de la plantilla) |
| **Prioridad** | `priority:{p0,p1,p2,p3}` | Triager |
| **Estado** | `status:{needs-triage,triaged,in-progress,blocked}` | Flujo de trabajo |
| Especiales | `good first issue` · `help wanted` · `security` | Triager |

> Los desplegables de área/severidad de las plantillas quedan en el cuerpo del issue. El
> workflow `Issue triage agent` los traduce automáticamente a `area:*`/`priority:*` cuando
> puede hacerlo con seguridad. El control humano sigue siendo obligatorio: el bot no marca
> `status:triaged`.

### Crear las labels en el repo

Un maintainer con permiso `write` las crea de una de dos formas:

**A) Workflow de sync (recomendado).** Ya incluido en
[`.github/workflows/labels.yml`](../../.github/workflows/labels.yml): corre **Actions → Sync
labels → Run workflow**, o automáticamente al cambiar `labels.yml` en `main`. Usa
`skip-delete: true` → nunca borra labels existentes.

**B) Manual con `gh` (sin CI).** Pegar en una terminal autenticada con `write`:

```bash
REPO=mawmawmaw/venezuela-ayuda
# Áreas
for a in ingesta datos fr admin ui db ci; do
  gh label create "area:$a" --repo $REPO --color 1d76db --description "Área: $a" --force
done
# Prioridad
gh label create "priority:p0" --repo $REPO --color b60205 --description "Crítico — prod ahora" --force
gh label create "priority:p1" --repo $REPO --color d93f0b --description "Alto" --force
gh label create "priority:p2" --repo $REPO --color fbca04 --description "Medio" --force
gh label create "priority:p3" --repo $REPO --color c2e0c6 --description "Bajo" --force
# Estado
gh label create "status:needs-triage" --repo $REPO --color ededed --description "Espera triage" --force
gh label create "status:triaged"      --repo $REPO --color 0e8a16 --description "Listo para tomar" --force
gh label create "status:in-progress"  --repo $REPO --color fbca04 --description "En curso" --force
gh label create "status:blocked"      --repo $REPO --color b60205 --description "Bloqueado" --force
# Especiales
gh label create "security" --repo $REPO --color b60205 --description "Seguridad / privacidad" --force
```

## ⚠️ Antes de empezar: reclamar el issue

**Regla obligatoria: nadie empieza a trabajar en un issue sin haberlo reclamado primero.**

Pasos:
1. Comenta en el issue que lo estás tomando (`"Lo tomo, empiezo hoy"`).
2. Asígnate el issue (botón **Assignees** en la barra lateral de GitHub).
3. Cambia el label a **`status:in-progress`**.

Solo entonces abre tu rama y empieza a programar.

**¿Por qué?** Sin este paso, dos colaboradores pueden trabajar en paralelo sobre el mismo
issue sin saberlo, generando conflictos, trabajo duplicado y PRs que se pisan entre sí.
Este problema ocurrió en la práctica (issue #51) — de ahí esta regla.

> Ver también [CONTRIBUTING.md](../../CONTRIBUTING.md) §"Punto de entrada: empieza por los
> issues" para el flujo completo desde cero.

---

## Ciclo de vida de un issue

```
abierto (status:needs-triage)
   │  ── triage: tipo + area:* + priority:* ──▶  status:triaged
   │                                                │
   │       reclamar (comentar + asignarse) ──▶  status:in-progress  ── PR ──▶  cerrado
   │                                                │
   │                          falta dependencia ──▶ status:blocked
   └─ inválido/duplicado ──▶ cerrado (invalid/duplicate)
```

- **PRs cierran issues** con `Closes #N` en la descripción.
- Reclamar el issue **antes** de empezar (ver sección de arriba) evita trabajo duplicado.

## Triage

- **Quién:** los **triagers** (rol de bajo riesgo, sin `write` a código — se otorga
  liberalmente) y los code owners del área. Ver [`gobernanza.md`](./gobernanza.md).
- **Qué hace el triage** a un `status:needs-triage`:
  1. ¿Es válido y no duplicado? Si no → cerrar con `invalid`/`duplicate`.
  2. Poner **`area:*`** (según el desplegable) y **`priority:*`**.
  3. ¿Buen punto de entrada? → `good first issue`. ¿Hace falta ayuda? → `help wanted`.
  4. Pasar a **`status:triaged`** y, si aplica, mandarlo al project board.
- **Cadencia:** revisar la cola `status:needs-triage` con regularidad (p. ej. a diario en
  emergencia activa). Un issue no debería quedar sin triage más de ~24-48 h.
- **p0 (crítico en prod):** notificar de inmediato al área y a un maintainer; no espera cola.

### Issue triage agent

El workflow [`.github/workflows/issue-triage.yml`](../../.github/workflows/issue-triage.yml)
corre en `issues: opened`, `edited` y `reopened`, además de manualmente con
`workflow_dispatch`.

Qué hace:

- Mantiene `status:needs-triage` si el issue no tiene ningún `status:*`.
- Traduce el desplegable `Área` / `Área afectada` a `area:*`.
- Traduce `Severidad` e `Impacto` a `priority:*`.
- Añade `security` + `priority:p0` si detecta lenguaje de seguridad/PII en un issue público.
- Respeta labels humanas existentes: si ya hay un `area:*` o `priority:*`, no lo pisa.

Qué no hace:

- No cambia `status:needs-triage` a `status:triaged`.
- No asigna personas ni cierra issues.
- No llama a LLMs ni envía contenido del issue a servicios externos.

Nota operativa: los workflows de eventos de issues se ejecutan desde la rama default de
GitHub. Este archivo se revisa por el flujo normal `staging`, pero empieza a clasificar issues
en vivo cuando se promueve a `main`.

#### Activarlo en el repo

1. Mergear el cambio a `staging` y promover `staging -> main`. GitHub solo ejecuta eventos
   `issues:*` desde la rama default.
2. Confirmar que las labels de [`.github/labels.yml`](../../.github/labels.yml) existen en el
   repo. Si faltan, correr **Actions -> Sync labels -> Run workflow** o crear labels con el
   comando de la sección "Crear las labels en el repo".
3. Abrir un issue de prueba con las plantillas para verificar que agrega `area:*` y `priority:*`
   sin marcar `status:triaged`.
4. Para issues ya existentes, correr **Actions -> Issue triage agent -> Run workflow** y pasar el
   número del issue. El trigger automático solo cubre issues nuevos/editados/reabiertos después de
   que el workflow esté en `main`.

### GitHub Agents para ordenar issues

Para una pasada asistida desde la pestaña **Agents** de GitHub, usa el prompt en
[`docs/colaboracion/agents/organizar-issues-copilot.md`](./agents/organizar-issues-copilot.md).
Ese prompt está pensado para organizar issues abiertos, proponer o aplicar labels y dejar
comentarios breves sin cerrar issues ni exponer datos sensibles.

Ese prompt no se ejecuta por estar guardado en el repo: se pega manualmente en una sesión de
GitHub Agents, o se usa como base para una Copilot Automation solo si GitHub la tiene disponible
para este repo. Para el flujo open source confiable, el disparador automático es el workflow
`Issue triage agent`.

## Project board (Projects v2)

Un board compartido para coordinar entre áreas (lo crea un maintainer en la pestaña
**Projects** del repo/org):

- **Columnas por estado:** `Needs triage` → `Triaged` → `In progress` → `In review` → `Done`.
- **Vistas guardadas:** una por `area:*` (cada equipo ve lo suyo) y una de **prioridad** para
  los p0/p1.
- **Automatización:** auto-añadir issues nuevos a `Needs triage`; mover a `In review` cuando
  hay PR enlazado; a `Done` al cerrar.

## Onboarding vía issues

Mantener una cola sana de **`good first issue`** (pequeños, bien descritos, con pistas de
dónde tocar) es la mejor puerta de entrada para voluntarios nuevos — y baja la carga de los
maintainers.
