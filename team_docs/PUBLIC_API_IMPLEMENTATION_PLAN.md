# Synapse SAP Explorer — Piano di Implementazione Public API v1

> **Data**: 26 Aprile 2026  
> **Stato**: Blueprint operativo  
> **Dipende da**: `team_docs/PUBLIC_API_ANALYSIS.md`

---

## 1. Obiettivo del documento

Questo documento definisce **cosa svilupperemo nel repository attuale** per rilasciare la Public API v1 di Synapse SAP Explorer.

Non descrive il contratto funzionale delle API in astratto: quello e' gia' coperto in `team_docs/PUBLIC_API_ANALYSIS.md`.

Qui fissiamo invece:

- **cartelle e file** da creare o modificare;
- **responsabilita' di ogni file**;
- **ordine di implementazione**;
- **dipendenze tra moduli**;
- **strategia di testing, rollout e deprecazione**.

---

## 2. Decisione architetturale confermata

La Public API v1 verra' sviluppata **nello stesso progetto Next.js**, non in una repository separata.

Struttura logica target:

```text
src/app/api/sap/*      -> endpoint interni usati dal frontend explorer
src/app/api/v1/*       -> endpoint pubblici stabili e versionati
src/app/api/admin/*    -> endpoint amministrativi autenticati
```

### Motivazioni operative

- Riutilizziamo i layer gia' esistenti in `src/lib/db`, `src/lib/sap`, `src/db`, `src/types`.
- Evitiamo duplicazione di query, mapper e tipi.
- Possiamo applicare hardening selettivo solo su `/api/v1/*`.
- Il lavoro e' di **facade + standardizzazione**, non di replatforming.

---

## 3. Principi di implementazione

1. **No breaking change sugli endpoint interni** `src/app/api/sap/*`.
2. **Tutti i nuovi contratti pubblici** vivono sotto `src/app/api/v1/*`.
3. **Nessuna logica business duplicata** dentro le route: la route pubblica deve chiamare helper/shared service.
4. **Response envelope unico** per tutte le route v1.
5. **Auth, rate limit e headers** applicati solo alla superficie pubblica.
6. **SSE e route Pro** gestite separatamente con policy piu' restrittive.
7. **Admin e register flows** restano fuori dalla Public Beta.

---

## 4. Mappa cartelle target

## 4.1 Cartelle esistenti che riutilizzeremo

```text
src/app/api/
src/lib/
src/db/
src/types/
drizzle/
team_docs/
docs/docs/explorer/
```

## 4.2 Cartelle nuove da introdurre

```text
src/app/api/v1/
src/lib/api/
src/lib/api/contracts/
src/lib/api/http/
src/lib/api/public/
src/lib/api/security/
```

> Nota: i nomi esatti possono essere lievemente adattati in fase implementativa, ma il principio e' fisso: **separare chiaramente il layer public API dal layer SAP interno**.

---

## 5. File plan — nuovi file da creare

## 5.1 Root / infrastruttura

### `middleware.ts`
**Scopo**
- intercettare richieste `/api/v1/*`;
- generare `X-Request-Id`;
- applicare CORS pubblico;
- demandare auth/rate-limit alle utility server-side quando necessario.

**Note**
- matcher limitato a `/api/v1/:path*`;
- non deve interferire con `src/app/api/sap/*` o con le pagine UI.

---

## 5.2 Helper Public API

### `src/lib/api/http/envelope.ts`
**Scopo**
- costruire la response standard `data/meta/error`.

**Responsabilita'**
- helper per lista;
- helper per singolo oggetto;
- helper per errore;
- calcolo `hasMore`, `source`, `requestId`, `dataAgeMs`.

### `src/lib/api/http/errors.ts`
**Scopo**
- tassonomia errori pubblici.

**Responsabilita'**
- mappa `code -> http status`;
- normalizzazione eccezioni applicative (`DB_UNAVAILABLE`, `RPC_UNAVAILABLE`, `INVALID_PARAM`, ecc.);
- fallback `INTERNAL_ERROR`.

### `src/lib/api/http/headers.ts`
**Scopo**
- centralizzare gli header obbligatori.

**Responsabilita'**
- `X-Request-Id`;
- `X-Data-Source`;
- `X-Data-Age`;
- rate limit headers;
- `Cache-Control`.

### `src/lib/api/http/pagination.ts`
**Scopo**
- parsing e validazione comune di `page`, `perPage`, `limit`, `offset`, cursori.

### `src/lib/api/http/params.ts`
**Scopo**
- validazione di parametri comuni (wallet, PDA, signature, boolean query flags, days/hours).

---

## 5.3 Security / quota / access control

### `src/lib/api/security/api-keys.ts`
**Scopo**
- validare e risolvere `x-api-key`.

**Responsabilita'**
- hash key;
- lookup tier;
- stato attivo/revocato;
- aggiornamento `lastUsedAt`.

### `src/lib/api/security/rate-limit.ts`
**Scopo**
- applicare il rate limit per tier.

**Responsabilita'**
- quota public / free / pro;
- risposta 429 uniforme;
- headers rate-limit.

### `src/lib/api/security/tiers.ts`
**Scopo**
- definire i tier e le capability associate.

**Esempi**
- Public;
- Free API key;
- Pro API key;
- Internal/Admin.

### `src/lib/api/security/cors.ts`
**Scopo**
- centralizzare le policy CORS per la public API.

---

## 5.4 Public facade / adapter layer

### `src/lib/api/public/status.ts`
**Scopo**
- aggregare salute DB, RPC, indexer e comporre `GET /api/v1/status`.

### `src/lib/api/public/agents.ts`
**Scopo**
- adapter tra route v1 e output degli endpoint/service esistenti agents.

### `src/lib/api/public/tools.ts`
**Scopo**
- adapter per list/tools detail events/schemas.

### `src/lib/api/public/escrows.ts`
**Scopo**
- adapter per escrows, escrow events, alerts, volume.

### `src/lib/api/public/transactions.ts`
**Scopo**
- adapter per transactions, tx detail, address events.

### `src/lib/api/public/network.ts`
**Scopo**
- adapter per metrics, graph, snapshots, health.

### `src/lib/api/public/stream.ts`
**Scopo**
- adapter per SSE e storico eventi.

### `src/lib/api/public/x402.ts`
**Scopo**
- adapter per global stats e pagamenti x402.

### `src/lib/api/public/settlements.ts`
**Scopo**
- adapter per settlements, receipts, disputes, pending settlements.

> Questi file non devono riscrivere la logica dati. Devono solo adattare il formato interno ai contratti pubblici v1.

---

## 5.5 Contratti tipizzati della Public API

### `src/types/public-api.ts`
**Scopo**
- contenere i tipi envelope e i payload stabilizzati per v1.

**Perche' separato da `src/types/api.ts`**
- `src/types/api.ts` oggi rappresenta soprattutto forme interne / frontend-facing;
- `public-api.ts` ci consente di congelare il contratto esterno senza vincolare i tipi interni.

**Tipi attesi**
- `PublicApiSuccess<T>`;
- `PublicApiError`;
- `PublicApiMeta`;
- `StatusResponseV1`;
- `PaginatedResponse<T>`;
- eventuali alias per resources pubbliche.

---

## 5.6 Route `/api/v1/*` da creare — fase Public Beta

### Stato / health

```text
src/app/api/v1/status/route.ts
```

### Core discovery

```text
src/app/api/v1/agents/route.ts
src/app/api/v1/agents/[wallet]/route.ts
src/app/api/v1/tools/route.ts
src/app/api/v1/escrows/route.ts
src/app/api/v1/escrows/[pda]/route.ts
src/app/api/v1/escrows/events/route.ts
src/app/api/v1/transactions/route.ts
src/app/api/v1/tx/[signature]/route.ts
src/app/api/v1/address/[address]/route.ts
src/app/api/v1/search/route.ts
src/app/api/v1/network/metrics/route.ts
src/app/api/v1/network/graph/route.ts
src/app/api/v1/network/snapshots/route.ts
```

### Core analytics secondari

```text
src/app/api/v1/escrows/alerts/route.ts
src/app/api/v1/volume/route.ts
src/app/api/v1/volume/daily/route.ts
src/app/api/v1/network/health/route.ts
```

---

## 5.7 Route `/api/v1/*` da creare — fase Pro / Advanced

```text
src/app/api/v1/settlements/route.ts
src/app/api/v1/receipts/route.ts
src/app/api/v1/disputes/route.ts
src/app/api/v1/pending-settlements/route.ts
src/app/api/v1/x402/stats/route.ts
src/app/api/v1/x402/payments/route.ts
src/app/api/v1/stream/route.ts
src/app/api/v1/events/stream/route.ts
src/app/api/v1/events/history/route.ts
```

---

## 5.8 Route da non implementare nella prima ondata

Queste restano fuori dalla Public Beta iniziale:

```text
src/app/api/v1/agents/register/*         (non aprire ancora)
src/app/api/v1/admin/*                   (nessun admin sotto v1)
webhooks                                 (da rivalutare dopo)
openapi auto-generation completa         (dopo stabilizzazione contratti)
```

---

## 6. File plan — file esistenti da modificare

## 6.1 Tipi e dominio

### `src/types/api.ts`
**Modifica prevista**
- minima o nulla, a seconda di quanto riusiamo;
- eventuali export condivisi verso `public-api.ts`.

### `src/types/index.ts`
**Modifica prevista**
- esportare anche i nuovi tipi public API.

---

## 6.2 DB schema e persistenza auth/quota

### `src/db/schema.ts`
**Modifica prevista**
- aggiungere tabelle per API keys e quota, ad esempio:
  - `api_keys`
  - `api_request_usage` oppure `api_rate_windows`

### `src/db/index.ts`
**Modifica prevista**
- rendere disponibile l'accesso alle nuove tabelle e query.

### `src/lib/db/queries.ts`
**Modifica prevista**
- query per API key lookup;
- query per usage counting / rate limit;
- eventuale query per health/status consolidato se conviene centralizzarla.

### `drizzle/006_public_api_keys.sql` *(nome indicativo)*
**Scopo**
- migrazione DB per introdurre le tabelle di auth/quota.

### `scripts/apply-public-api-m1.sh`
**Scopo**
- wrapper manuale `psql` per applicare la migrazione M1.

### `team_docs/PUBLIC_API_M1_DB_RUNBOOK.md`
**Scopo**
- istruzioni operative/manuali per apply, verifica, seed e rollback DB.

---

## 6.3 Documentazione e changelog

### `team_docs/PUBLIC_API_ANALYSIS.md`
**Modifica prevista**
- linkare questo piano di implementazione come documento esecutivo.

### `CHANGELOG.md`
**Modifica prevista**
- tracciare il rilascio Public API v1 Beta.

### `docs/docs/explorer/` *(documentazione pubblica)*
**Modifica prevista**
- aggiungere la documentazione user-facing dopo che i contratti v1 sono stabili.

---

## 7. Struttura finale attesa (snapshot)

```text
src/
  app/
    api/
      admin/
        metaplex/
          refresh/
            route.ts
      sap/
        ...existing internal routes...
      v1/
        status/
          route.ts
        agents/
          route.ts
          [wallet]/
            route.ts
        tools/
          route.ts
        escrows/
          route.ts
          [pda]/
            route.ts
          events/
            route.ts
          alerts/
            route.ts
        transactions/
          route.ts
        tx/
          [signature]/
            route.ts
        address/
          [address]/
            route.ts
        search/
          route.ts
        network/
          metrics/
            route.ts
          graph/
            route.ts
          snapshots/
            route.ts
          health/
            route.ts
        volume/
          route.ts
          daily/
            route.ts
        settlements/
          route.ts
        receipts/
          route.ts
        disputes/
          route.ts
        pending-settlements/
          route.ts
        x402/
          stats/
            route.ts
          payments/
            route.ts
        stream/
          route.ts
        events/
          stream/
            route.ts
          history/
            route.ts
  lib/
    api/
      contracts/
      http/
        envelope.ts
        errors.ts
        headers.ts
        pagination.ts
        params.ts
      public/
        agents.ts
        escrows.ts
        network.ts
        settlements.ts
        status.ts
        stream.ts
        tools.ts
        transactions.ts
        x402.ts
      security/
        api-keys.ts
        cors.ts
        rate-limit.ts
        tiers.ts
  db/
    schema.ts
    index.ts
  types/
    api.ts
    public-api.ts
middleware.ts
```

---

## 8. Dipendenze tra i moduli

## 8.1 Catena di chiamata target

```text
/api/v1 route
  -> src/lib/api/public/*
    -> src/lib/api/http/*
    -> src/lib/api/security/*
    -> src/lib/db/queries.ts / src/lib/sap/discovery.ts / src/lib/cache.ts
      -> src/db/index.ts / src/db/schema.ts
```

## 8.2 Regole di dipendenza

- Le route sotto `src/app/api/v1/*` **non devono** contenere query SQL o logica RPC direttamente.
- Le utility sotto `src/lib/api/http/*` **non devono** conoscere SAP o DB.
- Le utility sotto `src/lib/api/security/*` **non devono** conoscere il payload business dell'endpoint.
- Gli adapter sotto `src/lib/api/public/*` sono l'unico punto in cui il contratto v1 incontra il dominio interno.

---

## 9. Fasi di sviluppo

## 9.1 Fase 0 — Preparazione

**Output**
- documento approvato;
- ordine di implementazione concordato;
- elenco endpoint Public Beta congelato.

**Cartelle/file toccati**
- solo documentazione.

---

## 9.2 Fase 1 — Fondazioni trasversali

**Da implementare**
- `middleware.ts`
- `src/lib/api/http/*`
- `src/lib/api/security/*`
- `src/types/public-api.ts`
- migrazione DB API keys/quota

**Obiettivo**
- avere la base comune per tutte le route v1.

**Dipendenze**
- nessuna route v1 dovrebbe essere implementata prima di questa fase.

---

## 9.3 Fase 2 — Public Beta core

**Da implementare**
- `status`
- `agents`
- `tools`
- `escrows`
- `transactions`
- `address`
- `search`
- `network/metrics`
- `network/graph`
- `network/snapshots`

**Obiettivo**
- rilasciare un primo set pubblico stabile per consumer esterni.

---

## 9.4 Fase 3 — Analytics estesi e health approfondita

**Da implementare**
- `escrows/alerts`
- `volume`
- `volume/daily`
- `network/health`

**Obiettivo**
- coprire use case analytics/treasury.

---

## 9.5 Fase 4 — Pro endpoints

**Da implementare**
- `settlements`
- `receipts`
- `disputes`
- `pending-settlements`
- `x402/*`
- SSE streaming e history

**Obiettivo**
- introdurre i domini piu' costosi o piu' sensibili con auth e quota dedicate.

---

## 9.6 Fase 5 — Docs e rollout

**Da implementare**
- documentazione consumatori;
- esempi curl;
- changelog;
- pagina docs API pubblica.

---

## 10. Strategia di autenticazione e quota

## 10.1 Tier previsti

| Tier | Uso | Auth |
|---|---|---|
| Public | beta libera, endpoint base | nessuna key |
| Free API key | partner/dev | `x-api-key` |
| Pro API key | SSE, settlements, x402, storico | `x-api-key` |
| Admin | operazioni interne | header separato / env key |

## 10.2 Dove applicheremo i controlli

- **middleware**: request id, CORS, pre-filtering del path;
- **route v1**: enforcement del tier richiesto;
- **security helpers**: lookup key, rate limit, headers.

## 10.3 Decisioni operative iniziali

- non autenticare la Public Beta core nella primissima iterazione, ma predisporre il supporto tecnico subito;
- autenticare da subito SSE e route Pro;
- non unificare l'admin key attuale con le future API key pubbliche.

---

## 11. Strategia di testing

## 11.1 Test da prevedere

### A. Test di unità helper
- envelope;
- error mapping;
- param parsing;
- auth/tier resolution;
- rate limit.

### B. Test di route contract
- shape della response v1;
- headers obbligatori;
- error body coerenti.

### C. Test degraded mode
- DB down;
- RPC 502;
- indexer stale;
- route SSE con reconnect.

### D. Test di regressione
- gli endpoint `src/app/api/sap/*` esistenti non devono cambiare comportamento.

## 11.2 Dove li metteremo

Struttura proposta:

```text
tests/
  api/
    v1/
      status.test.ts
      agents.test.ts
      tools.test.ts
      escrows.test.ts
      transactions.test.ts
      network.test.ts
      stream.test.ts
  lib/
    api/
      envelope.test.ts
      errors.test.ts
      params.test.ts
      rate-limit.test.ts
```

> Se il repository non ha ancora un harness test formale per queste route, lo introdurremo nella fase implementativa. Questo documento ne definisce solo la destinazione.

---

## 12. Strategia documentazione

## 12.1 Documentazione interna

File interni di riferimento:

- `team_docs/PUBLIC_API_ANALYSIS.md`
- `team_docs/PUBLIC_API_IMPLEMENTATION_PLAN.md` *(questo file)*

## 12.2 Documentazione esterna

Destinazione prevista:

```text
docs/docs/explorer/public-api/
```

Contenuti previsti:
- overview;
- autenticazione;
- rate limits;
- endpoint reference;
- esempi curl;
- error handling;
- streaming guide.

---

## 13. Rollout plan

## 13.1 Ordine di rilascio

1. **Deploy invisibile** delle utility (`src/lib/api/*`, middleware, tabelle DB).
2. **Attivazione `GET /api/v1/status`**.
3. **Attivazione Public Beta core**.
4. **Attivazione analytics estesi**.
5. **Attivazione Pro endpoints con API key**.
6. **Documentazione pubblica e announcement**.

## 13.2 Regole di rollout

- ogni fase deve essere deployabile indipendentemente;
- nessuna fase deve richiedere refactor massivo delle route `sap/*`;
- ogni route v1 deve poter essere disabilitata singolarmente in caso di incidente.

---

## 14. Non-obiettivi della prima iterazione

Queste attivita' **non fanno parte** del primo ciclo di sviluppo:

- estrazione in repository separata;
- monorepo con `apps/api`;
- webhook pubblici;
- SDK pubblico completo;
- billing avanzato;
- portale self-service per creare API keys;
- OpenAPI auto-generated perfetta fin dal day one.

---

## 15. Checklist finale pre-implementazione

- [ ] Confermato sviluppo nello stesso progetto
- [ ] Confermata struttura `src/app/api/v1/*`
- [ ] Confermata introduzione `middleware.ts`
- [ ] Confermata creazione `src/lib/api/*`
- [ ] Confermata separazione `src/types/public-api.ts`
- [ ] Confermata migrazione DB per API keys/quota
- [ ] Confermata lista route Public Beta
- [ ] Confermata lista route Pro
- [ ] Confermata strategia test
- [ ] Confermata strategia rollout

---

## 16. Decisione operativa

Il prossimo step, dopo approvazione di questo documento, e' procedere con l'implementazione in questo ordine:

1. fondazioni trasversali;
2. status endpoint;
3. facade core v1;
4. quota/auth;
5. endpoint Pro;
6. docs pubbliche.

---

## 17. Backlog operativo task-by-task (stile sprint)

Legenda priorita':

- `P0` = bloccante per rilascio Public Beta
- `P1` = necessario per hardening/completamento
- `P2` = migliorativo post-beta

## 17.1 Epic A — Fondazioni trasversali (Fase 1)

| ID | Task | Pri | Dipendenze | Owner suggerito | Output atteso |
|---|---|---|---|---|---|
| A1 | Creare `src/types/public-api.ts` con envelope e error contracts | P0 | Nessuna | Backend | Contratti v1 tipizzati e condivisi |
| A2 | Creare `src/lib/api/http/envelope.ts` | P0 | A1 | Backend | Helper `success/error` uniformi |
| A3 | Creare `src/lib/api/http/errors.ts` | P0 | A1 | Backend | Mappa codici errore -> HTTP |
| A4 | Creare `src/lib/api/http/headers.ts` | P0 | A2, A3 | Backend | Header standard centralizzati |
| A5 | Creare `src/lib/api/http/pagination.ts` + `params.ts` | P0 | A1 | Backend | Parsing/validazione query condivisi |
| A6 | Creare `src/lib/api/security/tiers.ts` | P0 | Nessuna | Backend | Definizione tier accesso |
| A7 | Creare `src/lib/api/security/api-keys.ts` | P1 | A6 | Backend + DB | Lookup/API key resolution |
| A8 | Creare `src/lib/api/security/rate-limit.ts` | P1 | A6, A7 | Backend + DB | Enforcement 429 + headers |
| A9 | Creare `src/lib/api/security/cors.ts` | P0 | Nessuna | Backend | Policy CORS per `/api/v1/*` |
| A10 | Aggiungere `middleware.ts` con matcher `/api/v1/:path*` | P0 | A4, A9 | Backend | Request ID e pre-filtering v1 |
| A11 | Migrazione DB `drizzle/006_public_api_keys.sql` (nome indicativo) | P1 | A6 | Backend + DB | Tabelle keys/quota disponibili |

**Definition of Done (Epic A)**

- helper compilano in TypeScript strict;
- `middleware.ts` non impatta endpoint `sap/*`;
- envelope/error/headers sono usabili da qualsiasi route v1;
- path v1 supporta request-id e risposta errore standard.

**Acceptance criteria (Epic A)**

- almeno un endpoint smoke usa envelope e headers standard;
- errore forzato produce body `error.code/error.message/requestId`;
- check manuale: `/api/sap/*` invariato.

---

## 17.2 Epic B — Public Beta core (Fase 2)

| ID | Task | Pri | Dipendenze | Owner suggerito | Output atteso |
|---|---|---|---|---|---|
| B1 | Implementare `GET /api/v1/status` | P0 | A2-A5, A10 | Backend | Health consolidata pubblica |
| B2 | Implementare `GET /api/v1/agents` | P0 | A2-A5 | Backend | Lista agent con envelope |
| B3 | Implementare `GET /api/v1/agents/[wallet]` | P0 | B2 | Backend | Dettaglio agent v1 |
| B4 | Implementare `GET /api/v1/tools` | P0 | A2-A5 | Backend | Lista tool v1 |
| B5 | Implementare `GET /api/v1/escrows` + `[pda]` + `events` | P0 | A2-A5 | Backend | Dominio escrow core |
| B6 | Implementare `GET /api/v1/transactions` + `tx/[signature]` | P0 | A2-A5 | Backend | Dominio tx core |
| B7 | Implementare `GET /api/v1/address/[address]` | P0 | A2-A5 | Backend | Lookup address pubblico |
| B8 | Implementare `GET /api/v1/search` | P0 | A2-A5 | Backend | Ricerca pubblica |
| B9 | Implementare `GET /api/v1/network/metrics` + `graph` + `snapshots` | P0 | A2-A5 | Backend | Dominio network base |

**Definition of Done (Epic B)**

- tutti gli endpoint core rispondono con envelope v1 coerente;
- validazione input attiva su query/path params;
- headers minimi sempre presenti (`X-Request-Id`, `X-Data-Source`, `X-Data-Age`).

**Acceptance criteria (Epic B)**

- smoke test manuale di ogni route in 200/400/500;
- nessuna route v1 richiama direttamente SQL/RPC dentro `route.ts`;
- fallback source (`db/cache/rpc`) valorizzato in `meta.source`.

---

## 17.3 Epic C — Analytics estesi (Fase 3)

| ID | Task | Pri | Dipendenze | Owner suggerito | Output atteso |
|---|---|---|---|---|---|
| C1 | Implementare `GET /api/v1/escrows/alerts` | P1 | B5 | Backend | Alert operativi escrow |
| C2 | Implementare `GET /api/v1/volume` | P1 | B5, B9 | Backend | Volume protocollo v1 |
| C3 | Implementare `GET /api/v1/volume/daily` | P1 | C2 | Backend | Serie temporali volume |
| C4 | Implementare `GET /api/v1/network/health` | P1 | B1, B9 | Backend | Health avanzata network |

**Definition of Done (Epic C)**

- endpoint analytics allineati ai limiti query (`days/hours/limit`);
- degradazione gestita senza 500 non controllati.

**Acceptance criteria (Epic C)**

- query param fuori range normalizzati o 400 esplicito;
- payload coerente con contratti in `src/types/public-api.ts`.

---

## 17.4 Epic D — Pro endpoints + auth/quota (Fase 4)

| ID | Task | Pri | Dipendenze | Owner suggerito | Output atteso |
|---|---|---|---|---|---|
| D1 | Applicare enforcement tier su route Pro | P0 | A6-A8, B1-B9 | Backend | Access control per endpoint sensibili |
| D2 | Implementare `settlements/receipts/disputes/pending-settlements` | P1 | D1 | Backend | Dominio v0.7 pubblico Pro |
| D3 | Implementare `x402/stats` + `x402/payments` | P1 | D1 | Backend | Dominio x402 pubblico Pro |
| D4 | Implementare SSE Pro: `stream`, `events/stream`, `events/history` | P1 | D1 | Backend | Realtime con policy Pro |
| D5 | Hardening SSE (TTL, abort cleanup, reconnect guidance) | P1 | D4 | Backend | Stream robusti in produzione |

**Definition of Done (Epic D)**

- endpoint Pro rifiutano accesso non autenticato (`401/403`);
- rate limit headers presenti su route con key;
- SSE chiude connessioni zombie correttamente.

**Acceptance criteria (Epic D)**

- test su key valida/non valida/tier insufficiente;
- test reconnect client su stream con TTL;
- nessuna esposizione involontaria di route admin/register in v1.

---

## 17.5 Epic E — Test, docs e release (Fase 5)

| ID | Task | Pri | Dipendenze | Owner suggerito | Output atteso |
|---|---|---|---|---|---|
| E1 | Creare suite `tests/api/v1/*` | P0 | B1-B9 | QA + Backend | Regressione contratti v1 |
| E2 | Creare suite `tests/lib/api/*` | P0 | A1-A10 | QA + Backend | Unit test helper API |
| E3 | Aggiungere docs consumer in `docs/docs/explorer/public-api/` | P1 | B1-B9, D2-D4 | Docs + Backend | Guida pubblica endpoint |
| E4 | Aggiornare `CHANGELOG.md` con release Public API Beta | P1 | E1-E3 | Backend | Tracciabilita' rilascio |
| E5 | Checklist go-live + piano rollback | P0 | E1-E4 | Backend + Ops | Deploy sicuro e reversibile |

**Definition of Done (Epic E)**

- test minimi passano su endpoint core;
- docs pubbliche includono auth/error examples;
- rollback plan verificato e condiviso.

**Acceptance criteria (Epic E)**

- almeno un test per route core in 200 + errore;
- changelog allineato alla release effettiva;
- runbook go-live pronto in `team_docs/`.

---

## 17.6 Rischi/blocchi per epica

| Epic | Blocco possibile | Mitigazione |
|---|---|---|
| A | Migrazione DB non pronta | introdurre fallback in-memory temporaneo per beta |
| B | Divergenza envelope tra route | review obbligatoria su helper `envelope.ts` |
| C | Query costose su dataset grandi | caps aggressivi su `limit/days/hours` |
| D | Abuse su SSE/Pro route | tier enforcement + rate limit + TTL stream |
| E | Ritardo docs rispetto al codice | freeze contratti prima di scrivere docs finali |

---

## 17.7 Milestone di rilascio

| Milestone | Include | Gate di uscita |
|---|---|---|
| M1 — Foundation Ready | Epic A completo | smoke `status` + header/error standard |
| M2 — Public Beta Core | Epic B completo | route core v1 funzionanti e stabili |
| M3 — Analytics Complete | Epic C completo | metriche/alerts/volume validate |
| M4 — Pro Ready | Epic D completo | auth/quota/stream validati |
| M5 — Public Launch | Epic E completo | docs + changelog + rollback approvati |

---

## 17.8 Checklist esecutiva rapida

- [ ] M1 chiusa (fondazioni)
- [ ] M2 chiusa (public beta core)
- [ ] M3 chiusa (analytics)
- [ ] M4 chiusa (pro)
- [ ] M5 chiusa (launch)

