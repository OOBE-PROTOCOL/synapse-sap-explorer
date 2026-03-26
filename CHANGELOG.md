# CHANGELOG — Synapse SAP Explorer

Registro delle modifiche al progetto, in ordine cronologico inverso.
Aggiornare questo file ad ogni sessione di lavoro.

---

## 2026-03-26 — FASE 2 Completata: Indexer Worker (Polling)

### Obiettivo

Processo Node.js standalone che legge dati on-chain da Solana RPC e li scrive nel database PostgreSQL via Drizzle ORM.

### File creati

| File | Descrizione |
|---|---|
| `src/indexer/worker.ts` | Entry point: loop con 3 cicli (entities 60s, tx 30s, snapshots 5m). Supporta `--once` per single run. Graceful shutdown via SIGINT/SIGTERM. |
| `src/indexer/utils.ts` | Helper condivisi: `withRetry()` (backoff esponenziale), serializzazione `pk()` `bn()` `bnToDate()` `hashToHex()` `enumKey()`, `conflictUpdateSet()` per upsert Drizzle, logger con timestamp. |
| `src/indexer/cursor.ts` | Gestione `sync_cursors`: `getCursor(entity)` e `setCursor(entity, data)`. |
| `src/indexer/sync-agents.ts` | Fetch `findAllAgents()` + `findAllAgentStats()` → upsert `agents` + `agent_stats`. Batch di 20 con fallback row-by-row. |
| `src/indexer/sync-tools.ts` | Fetch `findAllTools()` → upsert `tools`. Gestione enum Anchor per category/httpMethod. |
| `src/indexer/sync-escrows.ts` | Fetch `findAllEscrows()` → upsert `escrows`. Mapping volumeCurve JSONB. |
| `src/indexer/sync-attestations.ts` | Fetch `findAllAttestations()` → upsert `attestations`. |
| `src/indexer/sync-feedbacks.ts` | Fetch `findAllFeedbacks()` → upsert `feedbacks`. |
| `src/indexer/sync-vaults.ts` | Fetch `findAllVaults()` → upsert `vaults`. |
| `src/indexer/sync-transactions.ts` | Sync incrementale via cursor: `getSignaturesForAddress` + `rawGetTransaction`. Idrata e scrive in `transactions` + `tx_details`. Pacing 200ms. |
| `src/indexer/sync-snapshots.ts` | `getNetworkOverview()` → INSERT in `network_snapshots` (time-series). |

### File modificati

| File | Modifica |
|---|---|
| `package.json` | Aggiunti: `dotenv` (runtime), `tsx` (dev). Script `indexer` e `indexer:once`. |

### Risultato primo run (`pnpm indexer:once`)

```
agents           5 upserted (+ 5 agent_stats)
tools            6 upserted
escrows          1 upserted
attestations     0 (nessuna on-chain)
feedbacks        0 (nessuna on-chain)
vaults           0 (nessuna on-chain)
transactions    50 inserted (+ 50 tx_details)
snapshots        2 captured
sync_cursors     aggiornati (tx cursor: slot 408958600)
```

### Come eseguire

```bash
# Single run (popola e esce)
pnpm indexer:once

# Continuous mode (loop infinito)
pnpm indexer
```

### Prossimo step

→ **FASE 3**: Riscrivere le API Routes per leggere dal DB via Drizzle invece che da RPC.

---

## 2026-03-26 — FASE 1 Completata: Provisioning Database

### Obiettivo

Database PostgreSQL `DB_SAP_EXP` creato, verificato e raggiungibile da locale.

### Azioni eseguite

| # | Azione | Stato |
|---|---|---|
| 1 | Connessione al server PostgreSQL (`194.87.141.89`) | ✅ Manuale |
| 2 | Esecuzione `drizzle/databse_DB_SAP_EXP.sql` (role, database, schema, permessi, estensioni) | ✅ Manuale |
| 3 | Esecuzione `drizzle/001_create_tables.sql` (11 tabelle + 86 indici + sync_cursors seed) | ✅ Manuale |
| 4 | Verifiche automatizzate (10 check via Node.js + pg) | ✅ Script |
| 5 | Test Drizzle Studio (`https://local.drizzle.studio`) | ✅ Funzionante |

### Risultati verifiche (Azione 4)

```
✅ Connessione:    DB_SAP_EXP / user_db_sap_exp / schema sap_exp
✅ Database:       owner=user_db_sap_exp, encoding=UTF8, collate=en_US.UTF-8
✅ Role:           NOSUPERUSER, NOCREATEDB, NOCREATEROLE, connlimit=30
✅ Schema:         sap_exp (owner: user_db_sap_exp) + public
✅ Search path:    sap_exp, public
✅ Estensioni:     pg_trgm 1.6, pgcrypto 1.3
✅ Tabelle:        11 (agents, agent_stats, tools, escrows, attestations,
                       feedbacks, vaults, transactions, tx_details,
                       network_snapshots, sync_cursors)
✅ Indici:         86
✅ Sync cursors:   8 entity pre-populated (last_slot=null)
✅ Smoke test:     CREATE → INSERT → SELECT → DROP OK
```

### File modificati

| File | Modifica |
|---|---|
| `package.json` | Aggiunta dipendenza dev `esbuild` (necessaria per drizzle-kit studio) |

### Prossimo step

→ **FASE 2**: Indexer Worker (ingestion dati on-chain → PostgreSQL)

---

## 2026-03-26 — Setup layer database PostgreSQL + Drizzle ORM

### Obiettivo

Creare l'infrastruttura database completa: script SQL di provisioning, strato ORM Drizzle con tipi, client singleton e configurazione ambiente.

---

### File creati

| File | Descrizione |
|---|---|
| `README_DB_CREATE.md` | Runbook operativo per creare da zero database, role e schema PostgreSQL. Include 10 sezioni: prerequisiti, verifiche infrastrutturali, comandi SQL, connection string, errori comuni. |
| `drizzle/databse_DB_SAP_EXP.sql` | Script SQL eseguibile come superuser: crea role `user_db_sap_exp`, database `DB_SAP_EXP`, schema `sap_exp`, permessi, estensioni, verifiche e smoke test. |
| `drizzle/001_create_tables.sql` | Script SQL con le CREATE TABLE di tutte le 11 tabelle + tutti gli indici (GIN, BRIN, partial, trgm) + INSERT iniziale di `sync_cursors`. Va eseguito dopo `databse_DB_SAP_EXP.sql`. |
| `src/db/schema.ts` | Schema Drizzle ORM con `pgSchema('sap_exp')` — tutte le 11 tabelle mappate con tipi JSONB tipizzati. |
| `src/db/relations.ts` | Relazioni Drizzle tra le tabelle (agents → tools, escrows, feedbacks, vaults, attestations, agentStats; transactions → txDetails). |
| `src/db/index.ts` | Client singleton: `Pool` pg + istanza `drizzle()` con schema e relations iniettate. Export `db` e tipo `Database`. |

---

### File modificati

| File | Modifica |
|---|---|
| `drizzle.config.ts` | Aggiunto `schemaFilter: ['sap_exp']` per limitare drizzle-kit allo schema custom. |
| `.env` | Corretta `DATABASE_URL` (era malformata: mancava `:` tra user e password, `@` non URL-encoded). |
| `.env.example` | Aggiunto placeholder `DATABASE_URL`. |
| `src/lib/env.ts` | Aggiunto getter validato `DATABASE_URL`. |
| `package.json` | Aggiunte dipendenze `drizzle-orm`, `pg` (runtime), `drizzle-kit`, `@types/pg` (dev). Aggiunti script `db:generate`, `db:push`, `db:migrate`, `db:studio`. |

---

### Dettaglio tecnico

#### Schema PostgreSQL: `sap_exp`

Le tabelle vivono nello schema `sap_exp` (non in `public`) per isolamento e sicurezza. Il `search_path` è impostato a livello di role.

#### Tabelle (11)

| # | Tabella | PK | FK | Note |
|---|---|---|---|---|
| 1 | `agents` | `pda` | — | 10 indici, JSONB tipizzati (capabilities, pricing, plugins) |
| 2 | `agent_stats` | `agent_pda` | → agents | CASCADE delete |
| 3 | `tools` | `pda` | → agents | 9 indici, trgm su tool_name |
| 4 | `escrows` | `pda` | → agents | 10 indici, JSONB volume_curve |
| 5 | `attestations` | `pda` | → agents | 8 indici, partial su is_active/expires_at |
| 6 | `feedbacks` | `pda` | → agents | 9 indici, partial su is_revoked |
| 7 | `vaults` | `pda` | → agents | 4 indici |
| 8 | `transactions` | `signature` | — | 14 indici + BRIN su slot |
| 9 | `tx_details` | `signature` | → transactions | 5 indici GIN su JSONB |
| 10 | `network_snapshots` | `id` (serial) | — | Time-series, BRIN su captured_at |
| 11 | `sync_cursors` | `entity` | — | Pre-populated con 8 entity |

#### Tipi JSONB definiti in `schema.ts`

```
Capability, PricingTier, VolumeCurveEntry, ActivePlugin,
TxProgram, AccountKey, ParsedInstruction, BalanceChange, TokenBalanceChange
```

#### Dipendenze aggiunte

```
drizzle-orm    ^0.45.1   (runtime)
pg             ^8.20.0   (runtime)
drizzle-kit    ^0.31.10  (dev)
@types/pg      ^8.20.0   (dev)
```

#### Script npm aggiunti

| Comando | Cosa fa |
|---|---|
| `pnpm db:generate` | Genera file di migrazione SQL da `schema.ts` → `./drizzle` |
| `pnpm db:push` | Applica lo schema direttamente al DB (dev, no file migrazione) |
| `pnpm db:migrate` | Esegue le migrazioni generate |
| `pnpm db:studio` | Apre Drizzle Studio (GUI web per esplorare il DB) |

---

### Struttura file risultante

```
synapse-sap-explorer/
├── drizzle/
│   ├── databse_DB_SAP_EXP.sql     ← provisioning DB/role/schema
│   └── 001_create_tables.sql      ← CREATE TABLE + indici
├── drizzle.config.ts              ← config drizzle-kit (schemaFilter: sap_exp)
├── README_DB_CREATE.md            ← runbook operativo PostgreSQL
├── .env                           ← DATABASE_URL (corretta)
├── .env.example                   ← placeholder DATABASE_URL
├── src/
│   ├── db/
│   │   ├── schema.ts              ← 11 tabelle + 9 tipi JSONB (pgSchema sap_exp)
│   │   ├── relations.ts           ← relazioni Drizzle
│   │   └── index.ts               ← client singleton (Pool + drizzle)
│   └── lib/
│       └── env.ts                 ← getter DATABASE_URL aggiunto
└── package.json                   ← deps + script db:*
```

---

### Come eseguire (ordine)

```bash
# 1. Provisioning database (sul server PostgreSQL, come superuser)
sudo -u postgres psql -f drizzle/databse_DB_SAP_EXP.sql

# 2. Creazione tabelle
sudo -u postgres psql -d DB_SAP_EXP -f drizzle/001_create_tables.sql

# 3. (Opzionale) Verifica con Drizzle Studio
pnpm db:studio
```

---

