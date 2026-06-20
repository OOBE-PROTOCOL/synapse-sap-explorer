# SAP Explorer v1.5 Refactor Plan

## Decision

Use `explorer-v1` as the product baseline and host application. It already has the richer explorer UI, SAP API surface, gRPC/hybrid worker, Metaplex enrichment, wallet/theme providers, public routes, and dense data views.

Use `explorer-v2` as the source for the cleaner modular internals: domain entities, contracts, repository boundaries, connector patterns, and stricter read-model rules.

Do not continue porting the v2 UI into production. The v2 UI can remain a spike, but the product should be rebuilt from the v1 experience.

## Target Shape

```text
explorer-v1
  src/app                  Product routes and layouts
  src/components           Explorer UI, shadcn primitives, wallet/theme/search
  src/hooks                React Query hooks preserving current API shapes
  src/app/api/sap          Compatibility API for current UI consumers
  src/server/read-model    Typed adapters backed by v2-style repositories
  src/indexer              Current v1 worker, hardened with v2 connector rules
  src/db                   Current schema plus missing v2 snapshot/read-model tables
```

## Migration Rules

- Preserve v1 route URLs and hook response shapes first.
- Move logic behind adapters before changing UI consumers.
- Charts must read from database snapshots or live RPC fallback, never generated samples.
- UI uses shadcn/Tailwind theme tokens only. No new hardcoded color palettes.
- Keep addresses globally resolvable and clickable.
- Agent identity priority: explicit logo, Metaplex image, endpoint favicon, initials.
- RPC/gRPC belongs in the indexer/server layer, not directly in pages.
- Every migration step must pass typecheck and at least one curl smoke test.

## What To Keep From v1

- `src/app/page.tsx` density and dashboard hierarchy.
- `src/app/agents/*` directory UX, filters, sorting, cards/list rows.
- `src/app/api/sap/*` breadth: overview, enriched agents, snapshots, graph, x402, disputes, vaults, escrows, health.
- `src/indexer/worker.ts` hybrid mode and gRPC transaction stream.
- Metaplex, balances, staking, revenue and truth-layer enrichment.

## What To Pull From v2

- Domain entity boundaries and public value object validation.
- Contract/DTO schemas where they reduce ambiguity.
- Repository pattern for database reads and writes.
- SAP account connector mapping through `synapse-sap-sdk`.
- Idempotent ingestion-run/cursor discipline.
- Snapshot-backed chart read APIs for agents, tools and network activity.

## First Implementation Pass

1. Add a v1 read-model adapter folder that exposes v2-style readers while returning v1-compatible payloads.
2. Add missing snapshot/read-model queries for agent/tool activity where v1 only has network snapshots.
3. Update `/api/sap/overview`, `/api/sap/agents/enriched`, `/api/sap/tools`, and slug APIs to use the adapter.
4. Keep existing v1 pages, but replace any synthetic chart series with adapter-backed real series.
5. Run `pnpm typecheck`, `pnpm db:check` or equivalent script, then curl dashboard/list/slug routes.
