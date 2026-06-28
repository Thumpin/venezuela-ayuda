# Instrucciones para GitHub Copilot

Las instrucciones del proyecto para agentes de IA son las de **[`AGENTS.md`](../AGENTS.md)**
(fuente única de verdad, compartida entre Claude Code, Cursor, Copilot y Codex).

**Lee y sigue `AGENTS.md` en la raíz del repositorio.** Lo esencial:

- App **Next.js en producción** para una emergencia; maneja **PII real** → máxima cautela.
- Verifica tu trabajo: `npm run lint`, `npm run build`, `npm test` deben pasar.
- **Nunca:** commitear secretos/`.env*`, exponer PII, borrar tests que fallan, push directo a
  `main`/`staging`, saltarte CI, ni migraciones destructivas.
- **Pregunta antes de:** tocar `supabase/migrations/`, `fr.ts`, `admin/`, deps o config.
- Cambios pequeños, por PR contra `staging`. Un humano revisa y es responsable.

> No dupliques reglas aquí: la fuente es `AGENTS.md`.
