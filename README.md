# handsup

Realtime learner forum on Cloudflare Workers. The spec is `docs/spec/spec-proposal.md`.

## Local development

```sh
pnpm install
cp .dev.vars.example .dev.vars   # fill in the values; never commit this file
pnpm db:migrate:local
pnpm dev                          # http://localhost:5173
```

## Checks

```sh
pnpm typecheck
pnpm test                         # Vitest on workerd
pnpm build && pnpm check:bundle   # native scrypt in the built Worker
pnpm test:e2e:app                 # browser tests against `vite dev` with test values
pnpm test:e2e:spikes              # M0 WebSocket blocking spikes
```

`pnpm test:e2e:app` ignores `.dev.vars`: it generates its own config and a fresh local
database under `node_modules/.cache/handsup-e2e`.
