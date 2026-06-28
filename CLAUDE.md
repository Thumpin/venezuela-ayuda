# CLAUDE.md

Claude and other coding agents should read `AGENTS.md` first. This file keeps the
short operational handoff for agent sessions.

## Default Behavior

- Treat this repository as the central backend and public coordination surface for
  Venezuela Ayuda.
- Make working changes, not only plans, unless the user explicitly asks for
  analysis only.
- Keep repo scope explicit. Do not move backend contracts into another repo
  without a maintainer decision.
- Prefer docs and code that are useful for outside contributors because this repo
  is public.
- Log server failures through `src/lib/log.mjs` (`logError`/`logWarn`/`logInfo`/
  `logDebug`); no `catch` or error-swallow path in `src/` should be silent. See
  the Observability / Logging section in `AGENTS.md`.

## Safety Rules

- Never reveal or commit secrets, private contact data, database exports, local
  backups, or production payloads.
- Never loosen redaction on public views, public API responses, or audit-history
  projection.
- Never trust caller-provided `source` for partner writes; it must come from the
  API key record.
- Never present duplicate detection as automatic identity resolution.
- Never put PII in logs: pass only the error and an allow-listed `context`
  (scope, `request_id`, view/table, status). No bodies, rows, headers, IPs, keys,
  phone/contact, or free text.
- Ask before destructive actions such as force-pushes, branch deletion, database
  resets, or migration rewrites.

## Useful Commands

```bash
npm install
npm run lint
npm test
npm run build
node scripts/check-migrations.mjs
```

`node scripts/check-migrations.mjs` needs Supabase environment variables. If the
credentials are unavailable, state that clearly instead of inventing a result.

## PR Discipline

- Branch from `upstream/staging` for normal feature, docs, and fix work.
- Push feature work to a fork branch, then open a PR against
  `mawmawmaw/venezuela-ayuda:staging`.
- Use <https://venezuela-ayuda-staging.vercel.app/> as the staging review app.
- If a PR is already open against `main`, rebase the branch onto
  `upstream/staging` before retargeting the PR so the diff stays focused.
- Keep PRs focused. Separate docs, migrations, UI, and API behavior when the
  review burden would otherwise get muddy.
- Include tests run and any blocked validation in the PR body.
- Use sanitized examples only.
