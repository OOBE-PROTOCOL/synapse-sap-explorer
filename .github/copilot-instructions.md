# Synapse SAP Explorer — Copilot Instructions

## Project Overview
This is a Next.js 14 (App Router) on-chain explorer for the Solana Agent Protocol (SAP). It reads PDA accounts from the SAP program (`SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ`) via `@oobe-protocol-labs/synapse-sap-sdk` and presents them through a glassmorphism UI.

## Architecture Rules
- **Server-only SDK access**: `SynapseClient` and `SapClient` are singletons created server-side. Never import them in client components.
- **API routes**: All SDK calls go through Next.js API routes (`src/app/api/sap/`). Client components `fetch()` these endpoints.
- **Custom hooks**: Client components use typed hooks from `src/hooks/use-sap.ts` (useAgents, useMetrics, useGraph, etc.).
- **Error handling**: Wrap all SDK calls in try/catch. Return proper JSON error responses from API routes.

## Key Files
- `src/lib/sap/discovery.ts` — SAP client singleton, entity queries, getRpcConfig()
- `src/lib/synapse/client.ts` — Synapse SDK singleton (server-only)
- `src/lib/env.ts` — Validated environment variables (SYNAPSE_API_KEY, SYNAPSE_NETWORK, SYNAPSE_REGION)
- `src/hooks/use-sap.ts` — Client-side data-fetching hooks
- `src/components/ui/` — Shared UI components (explorer primitives)
- `src/components/network/` — Force-directed graph visualization

## Code Style
- TypeScript strict mode, no `any` unless necessary for SDK interop
- Tailwind CSS for styling, custom glassmorphism classes in `globals.css`
- Server Components by default, `'use client'` only when needed
- d3-force for network graph visualization
