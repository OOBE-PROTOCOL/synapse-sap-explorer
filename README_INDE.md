# Indexer Worker (FASE 2)

Questo modulo supporta tre modalità:

- `polling` — sincronizzazione periodica RPC (stabile)
- `stream` — gRPC transactionSubscribe realtime
- `hybrid` — stream realtime + fallback polling light

## Avvio rapido

```bash
pnpm indexer:once
pnpm indexer:polling
pnpm indexer:stream
pnpm indexer:hybrid
```

## Variabili ambiente

```env
DATABASE_URL=postgresql://user:pass@host:5432/DB_SAP_EXP
INDEXER_MODE=hybrid
INDEXER_GRPC_COMMITMENT=confirmed
```

## Architettura file

- `worker.ts`: orchestrazione mode-aware
- `stream-transactions.ts`: gRPC subscribe + reconnect
- `sync-transactions.ts`: polling incrementale con cursor
- `tx-pipeline.ts`: hydration+upsert condivisa
- `entity-impact.ts`: mapping tx -> entity groups
- `refresh-queue.ts`: refresh coalescente entity toccate
- `sync-*.ts`: upsert entity su DB
- `cursor.ts`: gestione `sync_cursors`

## Nota attuale (Synapse gRPC auth)

In ambiente corrente, lo stream Yellowstone riceve:

`missing x-api-key metadata`

Quindi:
- la modalità `polling` è operativa;
- la modalità `stream/hybrid` entra in reconnect loop finché non viene risolto l'header auth lato transport.

