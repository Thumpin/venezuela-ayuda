# Documentación — Venezuela Ayuda

Índice central de la documentación técnica del proyecto, organizada con [Diátaxis](https://diataxis.fr/).

> Los archivos de nivel raíz (`README.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, `AGENTS.md`, etc.)
> no se mueven — son convencionales y esperados en el root del repo.

## Estructura

| Carpeta | Tipo Diátaxis | Qué contiene |
|---|---|---|
| [`explicacion/`](explicacion/) | Explicación | Arquitectura, diseño, decisiones "¿por qué?" |
| [`adr/`](adr/) | Decisiones | Architecture Decision Records numerados |
| [`colaboracion/`](colaboracion/) | Colaboración | Proceso, ramas, issues, migraciones, gobernanza |
| [`guias/`](guias/) | Guías | Cómo hacer X paso a paso |
| [`referencia/`](referencia/) | Referencia | Esquemas, enums, catálogos de consulta rápida |
| [`tutoriales/`](tutoriales/) | Tutoriales | Aprendizaje guiado para colaboradores nuevos |

---

## Documentos

### Arquitectura y estándares

- [ARCHITECTURE.md](../ARCHITECTURE.md) — forma del sistema, capas de runtime, modelo de datos, privacidad
- [Estándares técnicos y convenciones de código](explicacion/estandares-tecnicos.md) — stack, i18n, helpers a reusar, naming

### Hub central / API de ingesta

- [API de ingesta — Hub central](explicacion/ingesta-api-hub-central.md) — endpoints, audit log, decisiones de diseño
- [ADR-0001: Data Exchange API](adr/0001-feat-data-exchange-api.md) — plan técnico completo

### Colaboración

- [CONTRIBUTING.md](../CONTRIBUTING.md) — cómo empezar, reglas de oro, flujo de trabajo
- [Estrategia de ramas y protección](colaboracion/estrategia-de-ramas-y-proteccion.md) — modelo `feat → staging → main`, protección de ramas, QA
- [Gestión de issues](colaboracion/gestion-de-issues.md) — **cómo reclamar un issue**, labels, ciclo de vida, triage
- [Gestión de migraciones](colaboracion/gestion-de-migraciones.md) — convenciones y proceso para cambios de DB
- [Canales de comunicación](colaboracion/canales-de-comunicacion.md) — dónde hablar de cada tema
- [Gobernanza](colaboracion/gobernanza.md) — roles, permisos, toma de decisiones
- [Mejores prácticas de colaboración](colaboracion/00-mejores-practicas-colaboracion.md) — guía base con fuentes

### Referencia

- [Esquema de base de datos](referencia/database-schema.md) *(pendiente — ver [task/cc/docs-db-schema](https://github.com/mawmawmaw/venezuela-ayuda/tree/task/cc/docs-db-schema))*

---

## Convenciones

- **ADRs:** numeración secuencial de 4 dígitos, `docs/adr/NNNN-<slug>.md`. Ver [adr/README.md](adr/README.md).
- **Nuevos documentos:** colocar en la carpeta Diátaxis que corresponda.
- **Links:** rutas relativas desde la raíz del repo para que funcionen en GitHub y editores.
- **Reclamar trabajo:** antes de empezar cualquier tarea, comentar en el issue y asignártelo. Ver [gestión de issues](colaboracion/gestion-de-issues.md).
