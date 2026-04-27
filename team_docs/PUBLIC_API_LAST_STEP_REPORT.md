# Public API v1 — Report Ultimo Step

> Data: 26 Aprile 2026  
> Scope: Fase 1 / M1 (fondazioni) con **DB solo manuale**

---

## 1) Cosa ho fatto nell'ultimo step

### Fondazioni Public API (M1)

- Aggiunti contratti tipizzati Public API:
  - `src/types/public-api.ts`
  - export aggiornato in `src/types/index.ts`
- Aggiunti helper HTTP condivisi:
  - `src/lib/api/http/errors.ts`
  - `src/lib/api/http/headers.ts`
  - `src/lib/api/http/envelope.ts`
  - `src/lib/api/http/pagination.ts`
  - `src/lib/api/http/params.ts`
- Aggiunto layer sicurezza base:
  - `src/lib/api/security/tiers.ts`
  - `src/lib/api/security/api-keys.ts`
  - `src/lib/api/security/rate-limit.ts`
  - `src/lib/api/security/cors.ts`
- Aggiunto middleware solo su API pubbliche:
  - `middleware.ts` (matcher `/api/v1/:path*`)
- Implementato endpoint iniziale pubblico:
  - `src/app/api/v1/status/route.ts`
  - supportato da `src/lib/api/public/status.ts`

### DB support (senza apply automatico)

- Schema Drizzle esteso con tabelle Public API:
  - `api_keys`
  - `api_rate_windows`
  - file: `src/db/schema.ts`
- Query helper DB aggiunte:
  - `selectApiKeyByHash`
  - `touchApiKeyLastUsed`
  - `incrementApiRateWindow`
  - file: `src/lib/db/queries.ts`
- Migrazione SQL manuale creata:
  - `drizzle/006_public_api_keys.sql`
- Script manuale per apply creato:
  - `scripts/apply-public-api-m1.sh`
- Runbook manuale creato:
  - `team_docs/PUBLIC_API_M1_DB_RUNBOOK.md`
- Variabili env Public API documentate in:
  - `.env.example`

---

## 2) Verifica fatta

- Verifica sintassi script shell (senza esecuzione DB):

```zsh
bash -n /Users/xarm0rer/WORKSPACEs/synapse-sap-explorer/scripts/apply-public-api-m1.sh
```

- Verifica errori file principali con tooling IDE (`get_errors`) dopo le modifiche.
- Nessuna migrazione DB eseguita automaticamente dall'app in questo step.

> Nota: il typecheck completo via `pnpm -s typecheck` nell'ambiente corrente ha restituito `tsc: command not found`, quindi la validazione globale dipende dall'installazione toolchain locale.

---

## 3) Comandi per te — DB (manuali)

### Opzione A: apply diretto SQL

```zsh
cd /Users/xarm0rer/WORKSPACEs/synapse-sap-explorer
export DATABASE_URL='postgresql://user:pass@host:5432/dbname'
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f drizzle/006_public_api_keys.sql
```

### Opzione B: apply tramite script helper

```zsh
cd /Users/xarm0rer/WORKSPACEs/synapse-sap-explorer
export DATABASE_URL='postgresql://user:pass@host:5432/dbname'
./scripts/apply-public-api-m1.sh
```

---

## 4) Verifica post-migrazione (manuale)

```zsh
cd /Users/xarm0rer/WORKSPACEs/synapse-sap-explorer
psql "$DATABASE_URL" -c "\dt sap_exp.api_*"
psql "$DATABASE_URL" -c "\d+ sap_exp.api_keys"
psql "$DATABASE_URL" -c "\d+ sap_exp.api_rate_windows"
```

### Seed iniziale (opzionale)

> Inserire solo hash SHA-256 della chiave, mai la chiave in chiaro.

```zsh
cd /Users/xarm0rer/WORKSPACEs/synapse-sap-explorer
psql "$DATABASE_URL" -c "
INSERT INTO sap_exp.api_keys (key_prefix, key_hash, tier, is_active)
VALUES ('free_abcd', '<sha256_hex>', 'free', true)
ON CONFLICT (key_hash) DO NOTHING;
"
```

---

## 5) Esito atteso

### Apply migrazione (`psql ... -f drizzle/006_public_api_keys.sql`)

- Nessun errore SQL (`ERROR:`).
- Output tipico con `CREATE TABLE` / `CREATE INDEX` oppure `NOTICE`/`already exists` se rieseguita.

### Verifica strutture (`\dt sap_exp.api_*`)

- Devono comparire almeno queste due tabelle:
  - `sap_exp.api_keys`
  - `sap_exp.api_rate_windows`

### Verifica dettagli tabelle (`\d+ ...`)

- `sap_exp.api_keys`:
  - colonna `key_hash` presente e `UNIQUE`
  - colonna `tier` presente
  - colonne audit (`created_at`, `last_used_at`) presenti
- `sap_exp.api_rate_windows`:
  - colonne `identity_key`, `tier`, `window_start`, `request_count`
  - chiave primaria composta su (`identity_key`, `tier`, `window_start`)

### Seed iniziale

- Query `INSERT ... ON CONFLICT DO NOTHING` termina senza errori.
- Prima esecuzione: `INSERT 0 1` (tipicamente).
- Esecuzioni successive con stesso hash: `INSERT 0 0` (comportamento atteso).

### Verifica rapida seed

Puoi confermare la presenza della chiave con:

```zsh
cd /Users/xarm0rer/WORKSPACEs/synapse-sap-explorer
psql "$DATABASE_URL" -c "SELECT id, key_prefix, tier, is_active, created_at FROM sap_exp.api_keys ORDER BY id DESC LIMIT 10;"
```

Esito atteso:
- almeno una riga con `key_prefix` valorizzato;
- `tier` coerente (`free` o `pro`);
- `is_active = true`.

---

## 6) Riferimenti

- `drizzle/006_public_api_keys.sql`
- `scripts/apply-public-api-m1.sh`
- `team_docs/PUBLIC_API_M1_DB_RUNBOOK.md`
- `team_docs/PUBLIC_API_IMPLEMENTATION_PLAN.md`

