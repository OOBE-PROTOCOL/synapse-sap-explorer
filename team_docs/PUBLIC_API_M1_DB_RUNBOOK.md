# Public API M1 — DB Runbook (Manuale)

Questo runbook applica la migrazione DB della Fase 1 **solo manualmente**.

## 1) Prerequisiti

- `DATABASE_URL` puntata al DB corretto.
- `psql` disponibile sull'host da cui esegui.
- Backup/snapshot DB (consigliato prima di DDL).

## 2) Migrazione da applicare

- File SQL: `drizzle/006_public_api_keys.sql`
- Oggetti creati:
  - `sap_exp.api_keys`
  - `sap_exp.api_rate_windows`

## 3) Esecuzione manuale (opzione A)

```zsh
cd /Users/xarm0rer/WORKSPACEs/synapse-sap-explorer
export DATABASE_URL='postgresql://user:pass@host:5432/dbname'
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f drizzle/006_public_api_keys.sql
```

## 4) Esecuzione manuale (opzione B con script helper)

```zsh
cd /Users/xarm0rer/WORKSPACEs/synapse-sap-explorer
export DATABASE_URL='postgresql://user:pass@host:5432/dbname'
./scripts/apply-public-api-m1.sh
```

## 5) Verifica post-migrazione

```zsh
cd /Users/xarm0rer/WORKSPACEs/synapse-sap-explorer
psql "$DATABASE_URL" -c "\dt sap_exp.api_*"
psql "$DATABASE_URL" -c "\d+ sap_exp.api_keys"
psql "$DATABASE_URL" -c "\d+ sap_exp.api_rate_windows"
```

## 6) Seed iniziale chiavi (esempio)

> Inserire solo hash SHA-256 della chiave, mai la chiave in chiaro.

```zsh
cd /Users/xarm0rer/WORKSPACEs/synapse-sap-explorer
psql "$DATABASE_URL" -c "
INSERT INTO sap_exp.api_keys (key_prefix, key_hash, tier, is_active)
VALUES ('free_abcd', '<sha256_hex>', 'free', true)
ON CONFLICT (key_hash) DO NOTHING;
"
```

## 7) Rollback (solo se necessario)

```zsh
cd /Users/xarm0rer/WORKSPACEs/synapse-sap-explorer
psql "$DATABASE_URL" -c "DROP TABLE IF EXISTS sap_exp.api_rate_windows;"
psql "$DATABASE_URL" -c "DROP TABLE IF EXISTS sap_exp.api_keys;"
```

## 8) Note operative

- L'app non deve creare automaticamente queste tabelle a runtime.
- Se la migrazione non e' applicata, il layer security usa fallback (env/in-memory) senza interrompere il servizio.

