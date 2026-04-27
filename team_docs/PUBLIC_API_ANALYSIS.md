# Synapse SAP Explorer — Analisi API Pubblica (Aggiornata)

> **Data**: 26 Aprile 2026  
> **Stato**: Aggiornata su codice reale (`src/app/api`)  
> **Autore**: Engineering Team

---

## 1. Executive Summary

L'analisi precedente non rifletteva piu' lo stato dell'Explorer. Oggi la superficie API e' molto piu' ampia:

- **61 route totali** sotto `src/app/api`
- **58 route SAP** sotto `src/app/api/sap`
- **57 handler GET** e **5 handler POST**
- Nuovi domini gia' operativi: **streaming SSE**, **settlement ledger v0.7**, **x402 payments**, **metaplex linking/registration**, **network health**, **memory deep-dive**

Conclusione: invece di progettare da zero una `/api/v1/` teorica, conviene partire da una **stabilizzazione + productizzazione** della API attuale, introducendo versioning e policy senza perdere le funzionalita' gia' mature.

Il documento esecutivo che traduce questa analisi in cartelle, file, fasi e dipendenze e' `team_docs/PUBLIC_API_IMPLEMENTATION_PLAN.md`.

---

## 2. Stato Reale delle API (As-Is)

### 2.1 Core SAP Discovery

| Dominio | Endpoint principali | Note |
|---|---|---|
| Agents | `GET /api/sap/agents`, `GET /api/sap/agents/[wallet]`, `GET /api/sap/agents/map`, `GET /api/sap/agents/enriched`, `GET /api/sap/agents/resolve/[id]` | Filtri per `capability`, `protocol`, `limit`; enrichment da DB (settlement + metaplex) |
| Tools | `GET /api/sap/tools`, `GET /api/sap/tools/[pda]/events`, `GET /api/sap/tools/[pda]/schemas` | Supporto schema introspection e lifecycle events |
| Escrows | `GET /api/sap/escrows`, `GET /api/sap/escrows/[pda]`, `GET /api/sap/escrows/events`, `GET /api/sap/escrows/map`, `GET /api/sap/escrows/alerts` | Include attivi + chiusi, alert su expirations e low balance |
| Trust | `GET /api/sap/attestations`, `GET /api/sap/feedbacks` | Read model gia' pronto per trust systems |
| Vaults/Memory | `GET /api/sap/vaults`, `GET /api/sap/vaults/[pda]`, `GET /api/sap/vaults/[pda]/inscriptions` | Copre memory layers (vault/session/ledger/epoch/checkpoint) |

### 2.2 Transactions, Eventing e Lookup

| Dominio | Endpoint principali | Note |
|---|---|---|
| Transactions | `GET /api/sap/transactions`, `GET /api/sap/tx/[signature]` | DB-first + RPC fallback; paginazione e `after` slot |
| Stream realtime | `GET /api/sap/stream`, `GET /api/sap/events/stream`, `GET /api/sap/events/history` | SSE unificato + storico con cursori |
| Address intelligence | `GET /api/sap/address/[address]`, `GET /api/sap/address/[address]/events` | Lookup entita' e activity feed |
| Search | `GET /api/sap/search`, `GET /api/search` | Non piu' stub: entrambe implementate |

### 2.3 Analytics, Growth e Operations

| Dominio | Endpoint principali | Note |
|---|---|---|
| Metrics/graph | `GET /api/sap/metrics`, `GET /api/sap/graph`, `GET /api/sap/analytics`, `GET /api/sap/overview` | Overview batch riduce chiamate frontend |
| Volume/snapshots | `GET /api/sap/volume`, `GET /api/sap/volume/daily`, `GET /api/sap/snapshots` | Time-series e revenue ranking gia' disponibili |
| Settlement v0.7 | `GET /api/sap/settlements`, `GET /api/sap/pending-settlements`, `GET /api/sap/receipts`, `GET /api/sap/disputes` | Dominio nuovo non presente nell'analisi precedente |
| x402 | `GET /api/sap/x402/stats`, `GET /api/sap/x402/payments`, `GET /api/sap/agents/[wallet]/x402` | Pagamenti diretti + stats per agent/global |
| Health/admin | `GET /api/sap/network/health`, `GET /api/sap/health/endpoints`, `GET|POST /api/sap/invalidate`, `POST /api/admin/metaplex/refresh` | Health API presente in namespace SAP; admin key per refresh metaplex |

### 2.4 Metaplex e registrazione agent (POST)

| Endpoint | Metodo | Scopo |
|---|---|---|
| `/api/sap/agents/register/sap-to-metaplex` | `POST` | Flow A (SAP -> MPL) |
| `/api/sap/agents/register/metaplex-to-sap` | `POST` | Flow B (MPL -> SAP) |
| `/api/sap/agents/register/both` | `POST` | Flow C atomico |
| `/api/admin/metaplex/refresh` | `POST` | Re-sync snapshot metaplex con auth admin |

---

## 3. Delta vs Analisi Precedente

### 3.1 Differenze critiche

1. **Non sono 18 endpoint**: la piattaforma e' cresciuta a 61 route.
2. **`GET /api/health` non esiste nel codice corrente**: la health principale e' su `GET /api/sap/network/health` (+ `GET /api/sap/health/endpoints`).
3. **`GET /api/search` non e' stub**: e' implementato e interrogabile.
4. **Value-add gia' implementati**: `snapshots`, `volume`, `stream`, parte del dominio reputation/ledger.
5. **Nuovi verticali non documentati prima**: metaplex registration, x402, receipts/disputes/pending settlements, memory deep APIs.

### 3.2 Implicazioni

- L'Explorer ha gia' una base API da prodotto esterno, ma e' ancora mista tra endpoint "frontend-first" e endpoint "public-ready".
- La priorita' non e' solo aggiungere endpoint: e' **normalizzare schema response**, **governance**, **stabilita' operativa**.

---

## 4. Cosa Conviene Esporre Subito come API Esterna

### 4.1 Pacchetto "Public Beta" (riuso diretto)

Questi endpoint sono gia' adatti a uso esterno con hardening minimo:

- `GET /api/sap/agents`
- `GET /api/sap/agents/[wallet]`
- `GET /api/sap/tools`
- `GET /api/sap/escrows`
- `GET /api/sap/escrows/[pda]`
- `GET /api/sap/escrows/events`
- `GET /api/sap/transactions`
- `GET /api/sap/tx/[signature]`
- `GET /api/sap/metrics`
- `GET /api/sap/graph`
- `GET /api/sap/snapshots`
- `GET /api/sap/address/[address]`
- `GET /api/sap/search`

### 4.2 Pacchetto "Advanced/Pro"

Da esporre con quota superiore o policy dedicate:

- `GET /api/sap/stream` (SSE unificato)
- `GET /api/sap/events/stream`
- `GET /api/sap/events/history`
- `GET /api/sap/volume`
- `GET /api/sap/volume/daily`
- `GET /api/sap/settlements`
- `GET /api/sap/receipts`
- `GET /api/sap/disputes`
- `GET /api/sap/pending-settlements`
- `GET /api/sap/x402/payments`
- `GET /api/sap/x402/stats`

### 4.3 Endpoint da tenere "internal/admin"

- `POST /api/admin/metaplex/refresh`
- `POST /api/sap/invalidate` (solo con auth)
- `POST /api/sap/agents/register/*` (richiede threat model chiaro su abuso)

---

## 5. Proposta di Versionamento Pragmatica

Invece di duplicare tutto subito in `/api/v1`, usare una migrazione graduale:

### Fase A — Stabilizzazione As-Is (1-2 settimane)

- Contratto comune risposta (`data`, `meta`, `error`)
- Error code taxonomy (`DB_UNAVAILABLE`, `RPC_UPSTREAM_UNAVAILABLE`, `RATE_LIMITED`, ...)
- Header standard (`X-Data-Source`, `X-Data-Age`, `X-Request-Id`)
- Health endpoint unico pubblico: `GET /api/v1/status`

### Fase B — Facade `/api/v1` (2-3 settimane)

- Esporre `/api/v1/*` come facade sottile sopra service layer attuale
- Mappatura iniziale:
  - `/api/v1/agents` -> `/api/sap/agents`
  - `/api/v1/tools` -> `/api/sap/tools`
  - `/api/v1/escrows` -> `/api/sap/escrows`
  - `/api/v1/transactions` -> `/api/sap/transactions`
  - `/api/v1/network/metrics` -> `/api/sap/metrics`
  - `/api/v1/network/graph` -> `/api/sap/graph`

### Fase C — API Product (2-4 settimane)

- API key management (`x-api-key`)
- Rate limiting per tier
- OpenAPI 3.1 + docs pubbliche
- SLA/SLO e osservabilita' per endpoint critici

---

## 6. Rischi Operativi Emersi e Mitigazioni

I log recenti mostrano failure pattern concreti da considerare prima della pubblicazione esterna.

| Rischio | Evidenza | Impatto | Mitigazione consigliata |
|---|---|---|---|
| Instabilita' PostgreSQL | errore shared memory `58P01` | 500 su endpoint DB-first | restart policy DB, healthcheck aggressivo, circuit breaker con backoff |
| Stale indexer | `transactions_backfill` stale | dati incompleti su tx/eventi | runbook di start indexer + alerting su cursor lag |
| Upstream RPC 502 | retry falliti su fetch agents | degrado freshness | multi-provider RPC failover + retry jitter + cached fallback esplicito |
| Route health non allineata | assenza `GET /api/health` in codice | integrazioni confuse | standardizzare su `GET /api/v1/status` e redirect/deprecazione |

---

## 7. Use Case Esterni Prioritari (Aggiornati)

| # | Consumatore | Endpoint minimi | Priorita' |
|---|---|---|---|
| 1 | Marketplace agent AI | agents, tools, feedbacks, attestations, graph | Alta |
| 2 | Monitoring/alert bot | stream, events/history, transactions, volume/daily | Alta |
| 3 | Dashboard treasury/DeFi | escrows, escrows/events, volume, settlements, receipts | Alta |
| 4 | Wallet/explorer esterno | address lookup, tx detail, search, agent profile | Media |
| 5 | Sistemi trust/compliance | attestations, feedbacks, disputes, pending-settlements | Media |

---

## 8. Backlog API Pubblica (Ordine Consigliato)

1. **Hardening**: auth, rate limit, response envelope, status endpoint.
2. **Facade v1 core**: agents/tools/escrows/transactions/network.
3. **Realtime contract**: formalizzare SSE payload e cursori resume.
4. **Docs e DX**: OpenAPI, examples curl, changelog breaking/non-breaking.
5. **Commercial readiness**: piani quota, analytics usage, chiavi self-service.

---

## 9. Contratto Endpoint → API v1 (Mappatura per OpenAPI)

Tabella di mappatura tra endpoint interno attuale e percorso pubblico stabilizzato. Ogni riga definisce il contratto minimo che deve rimanere stabile tra versioni.

### 9.1 Agent Discovery

| Path pubblico v1 | Mappa da | Query param pubblici | Response chiave | Note stabilità |
|---|---|---|---|---|
| `GET /api/v1/agents` | `/api/sap/agents` | `capability`, `protocol`, `limit` (max 200) | `agents[]`, `total` | Stabile — nessuna breaking change prevista |
| `GET /api/v1/agents/:wallet` | `/api/sap/agents/[wallet]` | — | `pda`, `identity`, `reputation`, `pricing`, `settlementStats` | Stabile |
| `GET /api/v1/agents/:wallet/x402` | `/api/sap/agents/[wallet]/x402` | `limit`, `offset`, `scan` | `payments[]`, `stats`, `total` | Beta — `scan=true` ha latenza variabile |
| `GET /api/v1/agents/:wallet/memory` | `/api/sap/agents/[wallet]/memory` | — | `stats`, `vaults[]` | Beta — DB-only, senza RPC fallback |

### 9.2 Tool Registry

| Path pubblico v1 | Mappa da | Query param pubblici | Response chiave | Note stabilità |
|---|---|---|---|---|
| `GET /api/v1/tools` | `/api/sap/tools` | `category` | `tools[]`, `categories[]`, `total` | Stabile |
| `GET /api/v1/tools/:pda/schemas` | `/api/sap/tools/[pda]/schemas` | — | `schemas[]`, `total`, `source` | Beta — parsing RPC lento, SWR 60s |
| `GET /api/v1/tools/:pda/events` | `/api/sap/tools/[pda]/events` | `limit`, `type` | `events[]`, `total` | Beta — tabella opzionale, può restituire `warning` |

### 9.3 Escrow & Payments

| Path pubblico v1 | Mappa da | Query param pubblici | Response chiave | Note stabilità |
|---|---|---|---|---|
| `GET /api/v1/escrows` | `/api/sap/escrows` | — | `escrows[]`, `total` | Stabile — include closed |
| `GET /api/v1/escrows/:pda` | `/api/sap/escrows/[pda]` | — | oggetto escrow completo | Stabile |
| `GET /api/v1/escrows/events` | `/api/sap/escrows/events` | filtri multipli | `events[]` | Stabile |
| `GET /api/v1/escrows/alerts` | `/api/sap/escrows/alerts` | `hours` (max 720) | `expiringEscrows[]`, `lowBalanceEscrows[]` | Stabile |
| `GET /api/v1/volume` | `/api/sap/volume` | — | metriche aggregate + `topAgentsByRevenue[]` | Stabile |
| `GET /api/v1/volume/daily` | `/api/sap/volume/daily` | `bucket` (daily/hourly), `days`, `hours` | `series[]` | Stabile |

### 9.4 Settlement Ledger (v0.7)

| Path pubblico v1 | Mappa da | Query param pubblici | Response chiave | Note stabilità |
|---|---|---|---|---|
| `GET /api/v1/settlements` | `/api/sap/settlements` | `agent`, `depositor`, `escrow`, `limit`, `offset` | `entries[]`, `total`, `stats` | Beta — richiede migrazione DB 003 |
| `GET /api/v1/receipts` | `/api/sap/receipts` | `escrow`, `limit` | `receipts[]`, `total` | Beta — tabella opzionale |
| `GET /api/v1/disputes` | `/api/sap/disputes` | — | `disputes[]`, `total` | Beta — tabella opzionale |
| `GET /api/v1/pending-settlements` | `/api/sap/pending-settlements` | `escrow`, `limit` | `settlements[]`, `total` | Beta |

### 9.5 x402 Payments

| Path pubblico v1 | Mappa da | Query param pubblici | Response chiave | Note stabilità |
|---|---|---|---|---|
| `GET /api/v1/x402/stats` | `/api/sap/x402/stats` | — | stats globali x402 | Beta |
| `GET /api/v1/x402/payments` | `/api/sap/x402/payments` | `agent`, `payer`, `x402Only`, `limit`, `offset` | `payments[]`, `total` | Beta |

### 9.6 Transactions & Lookup

| Path pubblico v1 | Mappa da | Query param pubblici | Response chiave | Note stabilità |
|---|---|---|---|---|
| `GET /api/v1/transactions` | `/api/sap/transactions` | `page`, `perPage`, `after` (slot) | `transactions[]`, `total`, `source` | Stabile |
| `GET /api/v1/tx/:signature` | `/api/sap/tx/[signature]` | — | tx decodificata completa | Stabile |
| `GET /api/v1/address/:address` | `/api/sap/address/[address]` | — | entità identificata + SOL balance | Stabile |
| `GET /api/v1/address/:address/events` | `/api/sap/address/[address]/events` | — | activity feed per address | Stabile |
| `GET /api/v1/search` | `/api/sap/search` | `q`, `limit` | `results[]`, `total` | Stabile |

### 9.7 Network Intelligence & Streaming

| Path pubblico v1 | Mappa da | Query param pubblici | Response chiave | Note stabilità |
|---|---|---|---|---|
| `GET /api/v1/network/metrics` | `/api/sap/metrics` | — | metriche GlobalRegistry + volume | Stabile |
| `GET /api/v1/network/graph` | `/api/sap/graph` | `protocol`, `capability` | `nodes[]`, `links[]` | Stabile |
| `GET /api/v1/network/snapshots` | `/api/sap/snapshots` | `days` (max 365) | `snapshots[]`, `total` | Stabile |
| `GET /api/v1/network/health` | `/api/sap/network/health` | — | agents, escrows, growth, expiringEscrows | Stabile |
| `GET /api/v1/stream` | `/api/sap/stream` | `types`, `address` | SSE — `{type, payload}` | Pro — TTL 5 min, riconnessione client-side |
| `GET /api/v1/events/stream` | `/api/sap/events/stream` | — | SSE — eventi escrow | Pro |
| `GET /api/v1/events/history` | `/api/sap/events/history` | `afterSapId`, `afterEscrowId`, `limit` | `events[]`, `cursors`, `total` | Pro |

---

## 10. Contratto Status Endpoint e Error Envelope

### 10.1 `GET /api/v1/status`

Endpoint pubblico di health check unificato. Sostituisce e depreca l'attuale assenza di `/api/health`.

**Response 200 (tutto ok)**

```
{
  "status": "ok",
  "version": "1.0",
  "timestamp": "2026-04-26T10:00:00.000Z",
  "components": {
    "database": { "status": "ok", "latencyMs": 4 },
    "rpc": { "status": "ok", "latencyMs": 120 },
    "indexer": {
      "status": "ok",
      "agents": { "lastSyncAgo": 58, "stale": false },
      "transactions": { "lastSyncAgo": 14, "stale": false },
      "escrows": { "lastSyncAgo": 62, "stale": false }
    }
  }
}
```

**Response 200 (degradato)**

```
{
  "status": "degraded",
  "components": {
    "database": { "status": "error", "error": "58P01 shared memory" },
    "rpc": { "status": "ok", "latencyMs": 90 },
    "indexer": {
      "status": "stale",
      "transactions_backfill": { "lastSyncAgo": 396884, "stale": true }
    }
  }
}
```

> Il codice HTTP è sempre 200: i clienti devono leggere il campo `status` per distinguere `ok` / `degraded` / `down`. Usare 503 solo se nessun componente risponde.

### 10.2 Response Envelope Standard

Tutti gli endpoint `/api/v1/*` devono restituire una busta comune:

**Successo (lista)**

```
{
  "data": [ ... ],
  "meta": {
    "total": 42,
    "page": 1,
    "limit": 20,
    "hasMore": true,
    "source": "db",
    "dataAgeMs": 12000,
    "requestId": "req_abc123"
  }
}
```

**Successo (singolo oggetto)**

```
{
  "data": { ... },
  "meta": {
    "source": "cache",
    "dataAgeMs": 3500,
    "requestId": "req_xyz456"
  }
}
```

**Errore**

```
{
  "error": {
    "code": "DB_UNAVAILABLE",
    "message": "Database temporarily unreachable, retry in 30s.",
    "retryAfter": 30,
    "requestId": "req_err789"
  }
}
```

### 10.3 Error Code Taxonomy

| Codice | HTTP Status | Significato |
|---|---|---|
| `DB_UNAVAILABLE` | 503 | PostgreSQL non raggiungibile o circuit breaker aperto |
| `RPC_UNAVAILABLE` | 503 | Nodo Solana non disponibile (502/503 upstream) |
| `NOT_FOUND` | 404 | Entità (wallet, PDA, signature) non trovata in DB né on-chain |
| `INVALID_PARAM` | 400 | Param malformato (PDA non valido, limit fuori range, ecc.) |
| `RATE_LIMITED` | 429 | Quota superata; `retryAfter` in secondi |
| `UNAUTHORIZED` | 401 | API key mancante o non valida (endpoint Pro) |
| `FORBIDDEN` | 403 | Tier insufficiente per questo endpoint |
| `INTERNAL_ERROR` | 500 | Errore non gestito (con `requestId` per trace) |
| `STALE_DATA` | 200 | Warning non bloccante: dati oltre soglia age (in `meta.warnings[]`) |

---

## 11. Checklist di Hardening per Endpoint Pubblici

Schema di valutazione per ogni endpoint prima della pubblicazione esterna. Ogni punto è un requisito, non un suggerimento.

### 11.1 Sicurezza e Accesso

| Controllo | Applicabile a | Critico |
|---|---|---|
| L'endpoint non espone wallet privati, secret keys o env vars | Tutti | Sì |
| I parametri in input sono validati (tipo, range, formato PDA) | Tutti | Sì |
| Gli endpoint SSE chiudono la connessione dopo TTL (max 5 min) | SSE | Sì |
| I POST (register/*, admin/*) richiedono autenticazione esplicita | Admin + POST | Sì |
| CORS configurato per origin espliciti, non wildcard su endpoint Pro | Pro | Sì |
| Le API key sono hashate in DB, mai loggati in chiaro | Tutti auth | Sì |

### 11.2 Stabilità e Degraded Mode

| Controllo | Endpoint | Critico |
|---|---|---|
| In caso di DB down, l'endpoint risponde con dati parziali o 503, non 500 crashato | Tutti DB-first | Sì |
| In caso di RPC 502, l'endpoint usa la cache o DB, non crasha | Tutti RPC | Sì |
| Il circuit breaker `isDbDown()` è rispettato prima di ogni query | Tutti DB | Sì |
| SSE: il poll handle viene correttamente cancellato su `req.signal.abort` | SSE | Sì |
| Response bodies per errori inclusi per status 4xx e 5xx (no body vuoto) | Tutti | Sì |

### 11.3 Paginazione e Limiti

| Controllo | Endpoint | Critico |
|---|---|---|
| `limit` ha un cap hardcoded server-side (mai fidarsi del valore client) | Tutti list | Sì |
| Valori `offset` o `page` fuori range restituiscono lista vuota, non 500 | Tutti paginati | Sì |
| La response include `total` e `hasMore` per i consumer che paginano | Tutti list | Sì |
| Gli endpoint SSE limitano il burst iniziale (seed max N eventi) | SSE | Sì |

### 11.4 Caching e Freshness

| Controllo | Endpoint | Note |
|---|---|---|
| `Cache-Control` header è esplicito (non lasciato al proxy di default) | Tutti | Obbligatorio per SSE: `no-cache, no-transform` |
| Il campo `meta.source` indica se la risposta viene da `db`, `cache` o `rpc` | Tutti | Aiuta il debug del consumer |
| Il campo `meta.dataAgeMs` è calcolato rispetto alla fonte, non all'upstream | Tutti | Non usare `Date.now()` della response come proxy |
| `X-Accel-Buffering: no` è impostato su SSE per bypassare nginx buffering | SSE | Critico in produzione con nginx reverse proxy |

### 11.5 Headers Obbligatori (risposta)

| Header | Valore atteso | Obbligatorio |
|---|---|---|
| `X-Request-Id` | UUID v4 generato per ogni request | Sì |
| `X-Data-Source` | `db` / `cache` / `rpc` | Sì |
| `X-Data-Age` | Millisecondi di età del dato | Sì |
| `X-RateLimit-Limit` | Quota massima del tier | Sì (endpoint auth) |
| `X-RateLimit-Remaining` | Richieste rimanenti nella finestra | Sì (endpoint auth) |
| `X-RateLimit-Reset` | Timestamp Unix del reset | Sì (endpoint auth) |
| `Cache-Control` | Valore esplicito compatibile con il TTL dell'endpoint | Sì |

### 11.6 Stato per Endpoint (per priorità)

| Endpoint | Auth needed | Rate limit tier | Paginazione | Degraded mode | Pronto per Public Beta |
|---|---|---|---|---|---|
| `GET /api/v1/agents` | No | Public | Sì (`limit`) | Sì (DB + cache) | ✅ Con hardening headers |
| `GET /api/v1/agents/:wallet` | No | Public | No | Sì | ✅ |
| `GET /api/v1/tools` | No | Public | Sì (`category`) | Sì | ✅ |
| `GET /api/v1/escrows` | No | Public | No | Sì | ✅ |
| `GET /api/v1/escrows/:pda` | No | Public | No | Parziale | ✅ |
| `GET /api/v1/transactions` | No | Public | Sì (`page`, `perPage`) | Sì | ✅ |
| `GET /api/v1/tx/:signature` | No | Public | No | Sì | ✅ |
| `GET /api/v1/address/:address` | No | Public | No | Sì | ✅ |
| `GET /api/v1/search` | No | Public | Sì (`limit` max 50) | Sì | ✅ |
| `GET /api/v1/network/metrics` | No | Public | No | Sì | ✅ |
| `GET /api/v1/network/graph` | No | Public | No | Sì | ✅ |
| `GET /api/v1/network/snapshots` | No | Public | Sì (`days`) | Sì (RPC backfill) | ✅ |
| `GET /api/v1/escrows/alerts` | No | Public | No | Da verificare | ⚠️ Test degraded mode |
| `GET /api/v1/volume` | No | Public | No | Da verificare | ⚠️ Test degraded mode |
| `GET /api/v1/volume/daily` | No | Public | Sì (bucket) | Sì | ✅ |
| `GET /api/v1/settlements` | No | Pro | Sì (`limit`, `offset`) | No fallback | ⚠️ Richiede DB operativo |
| `GET /api/v1/receipts` | No | Pro | Sì | No fallback | ⚠️ Richiede migrazione 003 |
| `GET /api/v1/disputes` | No | Pro | No | No fallback | ⚠️ Richiede migrazione 003 |
| `GET /api/v1/x402/payments` | No | Pro | Sì | Da aggiungere | ⚠️ |
| `GET /api/v1/x402/stats` | No | Pro | No | Da aggiungere | ⚠️ |
| `GET /api/v1/stream` | Pro key | Pro | N/A (SSE) | Partial | ⚠️ Testare reconnect |
| `GET /api/v1/events/stream` | Pro key | Pro | N/A (SSE) | Partial | ⚠️ |
| `GET /api/v1/events/history` | Pro key | Pro | Cursori | Sì | ⚠️ |
| `POST /api/v1/agents/register/*` | Threat model richiesto | Speciale | N/A | N/A | 🔴 Non aprire ancora |

---

## 12. Decisione Architetturale: Repository Separata o Progetto Attuale?

### 12.1 Opzioni a confronto

Ci sono tre scenari possibili:

| Opzione | Descrizione |
|---|---|
| **A — Stesso repo (in-place)** | Aggiungere `/api/v1/` direttamente in `src/app/api/v1/` nel progetto attuale |
| **B — Repository separata** | Creare un progetto Node/Hono/Express dedicato che chiama il DB direttamente |
| **C — Monorepo con workspace** | Aggiungere un pacchetto `apps/api` che condivide i layer `lib/db`, `lib/sap`, types |

---

### 12.2 Analisi Opzione A — Stesso repo

**Vantaggi**

- **Zero duplicazione**: I service layer già esistenti (`src/lib/db/queries.ts`, `src/lib/sap/discovery.ts`, `src/lib/cache.ts`, `src/db/schema.ts`, tutti i mapper) sono riusati direttamente senza estrarre nulla.
- **Deploy unico**: Un solo processo pm2 / container gestisce sia il frontend che l'API pubblica. Nessuna complessità infrastrutturale aggiuntiva.
- **Shared types**: Tutti i tipi TypeScript (`ApiAgent`, `ApiTransaction`, ecc.) sono già definiti in `src/types/`. I contratti v1 ereditano senza conversioni.
- **Caching condiviso**: La cache SWR in-memory (`src/lib/cache.ts`) è condivisa tra frontend e API pubblica — le richieste si beneficiano a vicenda.
- **Rischio basso**: Non servono nuove infrastrutture. Il team conosce già il codebase.
- **Adatto alla fase attuale**: Con 58 route interne già operative, il lavoro è hardening + facade, non greenfield.

**Svantaggi**

- **Scaling accoppiato**: Se l'API pubblica genera carico elevato, impatta anche il frontend. Mitigabile con rate limiting server-side.
- **Confine meno netto**: Senza disciplina, i percorsi `/api/sap/*` (frontend-first) e `/api/v1/*` (public) possono confondersi nel tempo.
- **Deploy atomico**: Un bugfix critico all'API richiede un deploy completo dell'Explorer.

---

### 12.3 Analisi Opzione B — Repository separata

**Vantaggi**

- Scaling e deploy indipendenti.
- SLA separato per l'API pubblica.
- Permette di scegliere un framework più performante per API pure (Hono, Fastify).

**Svantaggi critici**

- **Duplicazione massiva**: Bisogna riscrivere o copiare `src/lib/db/queries.ts` (centinaia di query), `src/db/schema.ts` (schema Drizzle), tutti i mapper, la logica di cache SWR, il client SAP/Synapse. Sono migliaia di righe già testate in produzione.
- **Disallineamento garantito**: Ogni modifica al DB schema o alla logica di business nell'Explorer deve essere replicata manualmente nella repo API. Con un team piccolo, questo porta inevitabilmente a divergenze.
- **Latenza aggiuntiva**: Se l'API separata chiama gli endpoint interni dell'Explorer invece del DB direttamente, aggiunge un network hop e un SPOF in più.
- **Due pipeline CI/CD**: Test, build, deploy e monitoraggio duplicati.
- **Non giustificato adesso**: Ha senso solo se il traffico API diverge significativamente dal traffico frontend, scenario non presente nella fase attuale.

---

### 12.4 Analisi Opzione C — Monorepo con pnpm workspace

**Vantaggi**

- Condivisione formale tramite pacchetti interni (`@oobe/sap-db`, `@oobe/sap-types`, ecc.).
- Scaling e deploy separabili nel tempo.
- Il file `pnpm-workspace.yaml` è già presente nel progetto.

**Svantaggi**

- **Refactor significativo necessario**: `src/lib/`, `src/db/`, `src/types/` devono essere estratti in pacchetti condivisi prima che qualsiasi secondo `app` possa usarli.
- **Overhead di setup**: Package boundaries, build scripts, versioning interno.
- **Overkill adesso**: Utile se si prevede un terzo client (es. SDK TypeScript pubblico, dashboard admin separata). Con due app, la complessità non giustifica il gain.

---

### 12.5 Raccomandazione

**Sviluppare nel progetto attuale (Opzione A)**, con un'unica accortezza strutturale: mantenere una separazione netta tra:

```
src/app/api/sap/*      ← endpoint "frontend-internal" (non versionati, possono cambiare)
src/app/api/v1/*       ← endpoint "public API" (stabili, con contratto)
src/app/api/admin/*    ← endpoint "admin-only" (autenticati, non pubblici)
```

Questo permette di:
1. **Rilasciare la Public Beta senza toccare nulla dell'infrastruttura esistente** — basta aggiungere la facade `/api/v1/`.
2. **Applicare hardening selettivo** solo ai percorsi `/api/v1/*` (auth, rate limit, headers standard) tramite middleware Next.js su quel path specifico.
3. **Rivalutare il monorepo** solo se e quando il traffico API richiederà scaling separato — decisione rimandabile di 6-12 mesi senza perdite.

### 12.6 Quando invece ha senso separare

Rivalutare Opzione B o C se si verificano **almeno due** di queste condizioni:

- Il traffico API esterna supera il traffico frontend in modo significativo (10x+).
- Si vuole offrire garanzie SLA all'API indipendentemente dall'uptime del frontend.
- Si sviluppa un SDK TypeScript pubblico (`@oobe-protocol-labs/sap-explorer-sdk`) che deve dipendere da un pacchetto, non da un'app Next.js.
- Il team cresce e due team separati gestiscono frontend e API.
- Si vuole deployare l'API su un'infrastruttura diversa (es. edge, serverless Functions) mentre il frontend resta su VPS con pm2.

---

## 13. Appendice — Route Catalog (Snapshot 26/04/2026)

Percorsi root presenti:

- `src/app/api/sap/*` (58 route)
- `src/app/api/search/route.ts`
- `src/app/api/og/route.tsx`
- `src/app/api/admin/metaplex/refresh/route.ts`

Nota: questo documento e' allineato al codice sorgente locale. Eventuali differenze in produzione possono dipendere da deploy parziali, env vars o migrazioni DB non applicate.

