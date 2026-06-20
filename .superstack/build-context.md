# Build Context

```yaml
project:
  name: synapse-sap-explorer-v2
  path: explorer-v2
  stack: Next.js 15, TypeScript, PostgreSQL, Drizzle, Solana JSON-RPC
review:
  reviewed_at: 2026-06-17
  security_score: B
  quality_score: B
  ready_for_mainnet: false
  findings:
    - severity: high
      category: correctness
      description: The v2 indexer ingests transactions but does not yet fetch and decode agent or tool accounts from Solana. Those read models still depend on v1-populated tables.
      fix: Add agent and tool account connectors, decoders, and scheduled snapshot use cases before operating v2 without the v1 indexer.
    - severity: high
      category: operations
      description: The configured database is missing the three v2 tables.
      fix: Run pnpm db:migrate with the deployment DATABASE_URL, then require pnpm db:check to pass.
    - severity: medium
      category: security
      description: Public API routes have validation and security headers but no distributed rate limiter.
      fix: Enforce per-IP and per-key limits at the reverse proxy or a shared Redis-backed middleware.
    - severity: medium
      category: testing
      description: Unit tests cover contracts, RPC fallback, decoding, and transaction sync, but PostgreSQL integration and browser E2E tests are absent.
      fix: Add a disposable PostgreSQL integration suite and Playwright coverage for directory, detail, error, and empty states.
    - severity: medium
      category: operations
      description: explorer-v1 and explorer-v2 are untracked while the former root application appears deleted in Git.
      fix: Review the move, then stage the intended directories and workflow files before relying on CI or deployment.
  verified:
    typecheck: passed
    lint: passed
    unit_tests: 11 passed
    production_build: passed
    workflow_yaml: passed
    database_schema_check: failed_missing_v2_tables
    git_tracking: blocked_untracked_workspace_move
```
