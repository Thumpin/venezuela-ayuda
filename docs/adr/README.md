# Architecture Decision Records (ADRs)

Los ADRs documentan decisiones técnicas significativas: qué se decidió, por qué, y qué alternativas se descartaron.

## Índice

| # | Título | Estado |
|---|---|---|
| [0001](0001-feat-data-exchange-api.md) | Data Exchange API — Hub central push-only | completed |

## Formato de un ADR nuevo

Cada ADR lleva este frontmatter:

```yaml
---
title: "<título de la decisión>"
type: feat|fix|refactor|chore
status: proposed|accepted|deprecated|superseded
created: YYYY-MM-DD
superseded_by: NNNN   # solo si status = superseded
---
```

Secciones recomendadas: **Resumen**, **Contexto**, **Decisión**, **Alternativas descartadas**, **Consecuencias**.

## Convenciones

- Filename: `docs/adr/NNNN-<slug>.md` (numeración secuencial de 4 dígitos).
- Un ADR no se borra; si queda obsoleto, su `status` pasa a `deprecated` o `superseded`.
- Al crear un ADR nuevo, añadir una fila al índice de arriba.
