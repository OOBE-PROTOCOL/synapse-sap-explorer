# Creazione Database PostgreSQL — Runbook Operativo

> Guida step-by-step per creare un nuovo database PostgreSQL dedicato a una nuova applicazione, su un server dove PostgreSQL è già installato e funzionante.

---

## 1. Scopo

Creare un database PostgreSQL separato, con role e schema dedicati, per una nuova applicazione — mantenendolo isolato dal database `forge` già esistente.

**Placeholder da sostituire in tutta la guida:**

| Placeholder | Descrizione | Esempio |
|---|---|---|
| `<DB_NAME>` | Nome del nuovo database | `sap_explorer` |
| `<APP_USER>` | Role/utente applicativo | `sap_app` |
| `<APP_PASSWORD>` | Password del role applicativo | `S3cur3P@ss!` |
| `<SCHEMA_NAME>` | Schema dedicato nel nuovo database | `app` |

---

## 2. Scelta consigliata: nuovo database o nuovo schema?

| Criterio | Nuovo Schema (stesso DB) | Nuovo Database |
|---|---|---|
| Applicazioni diverse e indipendenti | ✗ | **✓** |
| Condivisione di tabelle tra app | **✓** | ✗ |
| Backup/restore indipendente | ✗ | **✓** |
| Isolamento completo delle connessioni | ✗ | **✓** |
| Cross-query tra le due app | **✓** | ✗ (serve `dblink`/`fdw`) |
| Ciclo di vita separato (drop, migrate) | Rischioso | **✓** |

### Verdetto per questo caso

**→ Nuovo database.** Le due applicazioni sono indipendenti, non condividono tabelle e devono avere cicli di backup/deploy/migrate separati. All'interno del nuovo database creeremo comunque uno **schema dedicato** (diverso da `public`) per mantenere ordine e abilitare future estensioni multi-schema.

---

## 3. Prerequisiti

- PostgreSQL installato e in esecuzione (`systemctl status postgresql`)
- Accesso al server come utente con privilegi di superuser PostgreSQL (tipicamente `postgres`)
- Il database `forge` già presente (non verrà toccato)

```bash
# Verifica che PostgreSQL sia attivo
sudo systemctl status postgresql

# Verifica i database esistenti
sudo -u postgres psql -c "\l"
```

### 3.1 Verifiche infrastrutturali

Prima di procedere, controlla la configurazione corrente dell'istanza PostgreSQL:

```bash
# Indirizzo di ascolto (localhost, *, IP specifico)
sudo -u postgres psql -c "SHOW listen_addresses;"

# Porta in uso
sudo -u postgres psql -c "SHOW port;"

# Percorso del file pg_hba.conf (autenticazione)
sudo -u postgres psql -c "SHOW hba_file;"

# Percorso del file postgresql.conf (configurazione principale)
sudo -u postgres psql -c "SHOW config_file;"

# Directory dei dati (PGDATA)
sudo -u postgres psql -c "SELECT current_setting('data_directory');"
```

> **Perché questi controlli?**
> - `listen_addresses` → conferma se il server accetta connessioni remote o solo locali.
> - `port` → assicura che la porta sia quella attesa (default `5432`).
> - `hba_file` → individua il file da modificare se serve aggiungere regole di accesso per il nuovo role.
> - `config_file` → utile se devi cambiare `listen_addresses` o altri parametri.
> - `data_directory` → utile per backup, log e troubleshooting.

---

## 4. Creazione role applicativo

Creiamo un role dedicato con `LOGIN` e password. Non assegniamo `SUPERUSER` né `CREATEDB` — principio del minimo privilegio.

```bash
sudo -u postgres psql <<'SQL'
-- Crea il role applicativo
CREATE ROLE <APP_USER>
  WITH LOGIN
       PASSWORD '<APP_PASSWORD>'
       NOSUPERUSER
       NOCREATEDB
       NOCREATEROLE
       INHERIT
       CONNECTION LIMIT 20;

COMMENT ON ROLE <APP_USER> IS 'Role applicativo per <DB_NAME>';
SQL
```

> **Nota:** `CONNECTION LIMIT 20` è un esempio ragionevole. Adatta il valore al pool di connessioni della tua applicazione (es. se usi `pg` con `Pool({ max: 10 })`, un limite di 20 lascia margine per connessioni di manutenzione).

---

## 5. Creazione nuovo database

```bash
sudo -u postgres psql <<'SQL'
-- Crea il database assegnando il role come owner
CREATE DATABASE <DB_NAME>
  WITH OWNER = <APP_USER>
       ENCODING = 'UTF8'
       LC_COLLATE = 'en_US.UTF-8'
       LC_CTYPE = 'en_US.UTF-8'
       TEMPLATE = template0;

COMMENT ON DATABASE <DB_NAME> IS 'Database per applicazione <DB_NAME>';
SQL
```

> **Perché `TEMPLATE = template0`?** Garantisce un database pulito con encoding corretto, senza oggetti ereditati da `template1`.

> **Perché `OWNER = <APP_USER>`?** L'owner può creare/eliminare tabelle, schema e indici nel proprio database senza bisogno di grant aggiuntivi.

---

## 6. Creazione schema dedicato

Connettiamoci al **nuovo** database e creiamo lo schema.

```bash
sudo -u postgres psql -d <DB_NAME> <<'SQL'
-- Crea lo schema dedicato
CREATE SCHEMA <SCHEMA_NAME> AUTHORIZATION <APP_USER>;

-- Imposta lo schema come default nel search_path del role
ALTER ROLE <APP_USER> IN DATABASE <DB_NAME>
  SET search_path = <SCHEMA_NAME>, public;

-- Revoca i permessi sullo schema public per sicurezza
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

COMMENT ON SCHEMA <SCHEMA_NAME> IS 'Schema applicativo principale per <DB_NAME>';
SQL
```

> **Perché non usare solo `public`?** Lo schema `public` è accessibile di default a tutti i role. Uno schema dedicato offre isolamento e controllo dei permessi più granulare.

---

## 7. Permessi e impostazioni consigliate

```bash
sudo -u postgres psql -d <DB_NAME> <<'SQL'
-- Il role è owner del DB e dello schema, quindi ha già i permessi.
-- Aggiungiamo solo le grant esplicite per chiarezza e per eventuali role futuri.

-- Permessi sullo schema
GRANT USAGE  ON SCHEMA <SCHEMA_NAME> TO <APP_USER>;
GRANT CREATE ON SCHEMA <SCHEMA_NAME> TO <APP_USER>;

-- Permessi di default sugli oggetti futuri creati nel nuovo schema
ALTER DEFAULT PRIVILEGES
  IN SCHEMA <SCHEMA_NAME>
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO <APP_USER>;

ALTER DEFAULT PRIVILEGES
  IN SCHEMA <SCHEMA_NAME>
  GRANT USAGE, SELECT ON SEQUENCES TO <APP_USER>;

-- (Opzionale) Abilita estensioni utili
CREATE EXTENSION IF NOT EXISTS pg_trgm;       -- fuzzy search, indici GIN trigram
CREATE EXTENSION IF NOT EXISTS pgcrypto;       -- gen_random_uuid(), hashing

SQL
```

> **Best practice pg_hba.conf:** Verifica che il file `pg_hba.conf` consenta la connessione del role al nuovo database. Esempio di riga da aggiungere (se necessario):
>
> ```
> # TYPE  DATABASE     USER        ADDRESS         METHOD
> host    <DB_NAME>    <APP_USER>  127.0.0.1/32    scram-sha-256
> host    <DB_NAME>    <APP_USER>  ::1/128         scram-sha-256
> ```
>
> Dopo la modifica:
> ```bash
> sudo systemctl reload postgresql
> ```

---

## 8. Verifiche finali

### 8.1 Verifica database

```bash
sudo -u postgres psql -c "\l" | grep <DB_NAME>
```

Output atteso:
```
 <DB_NAME> | <APP_USER> | UTF8 | en_US.UTF-8 | en_US.UTF-8 |
```

### 8.2 Verifica role

```bash
sudo -u postgres psql -c "\du <APP_USER>"
```

Output atteso:
```
                        List of roles
 Role name | Attributes
-----------+-----------
 <APP_USER> | 20 connections
```

### 8.3 Verifica schema

```bash
sudo -u postgres psql -d <DB_NAME> -c "\dn+"
```

Output atteso:
```
       List of schemas
    Name     |  Owner     | ...
-------------+------------+----
 <SCHEMA_NAME> | <APP_USER> |
 public        | postgres   |
```

### 8.4 Verifica search_path

```bash
sudo -u postgres psql -d <DB_NAME> -c "SHOW search_path;" -U <APP_USER>
```

Output atteso:
```
 search_path
--------------
 <SCHEMA_NAME>, public
```

### 8.5 Test connessione applicativa

```bash
psql "postgresql://<APP_USER>:<APP_PASSWORD>@localhost:5432/<DB_NAME>?schema=<SCHEMA_NAME>" \
  -c "SELECT current_database(), current_user, current_schema();"
```

Output atteso:
```
 current_database | current_user | current_schema
------------------+--------------+----------------
 <DB_NAME>        | <APP_USER>   | <SCHEMA_NAME>
```

### 8.6 Test creazione tabella (smoke test)

```bash
psql "postgresql://<APP_USER>:<APP_PASSWORD>@localhost:5432/<DB_NAME>" <<'SQL'
CREATE TABLE <SCHEMA_NAME>._test_connection (id serial PRIMARY KEY, ts timestamptz DEFAULT now());
INSERT INTO <SCHEMA_NAME>._test_connection DEFAULT VALUES;
SELECT * FROM <SCHEMA_NAME>._test_connection;
DROP TABLE <SCHEMA_NAME>._test_connection;
SQL
```

---

## 9. Esempio connection string

### Formato URI standard

```
postgresql://<APP_USER>:<APP_PASSWORD>@<HOST>:5432/<DB_NAME>?options=-csearch_path%3D<SCHEMA_NAME>
```

### Esempi concreti

```bash
# Connessione locale
DATABASE_URL="postgresql://sap_app:S3cur3P%40ss!@localhost:5432/sap_explorer?options=-csearch_path%3Dapp"

# Connessione remota con SSL
DATABASE_URL="postgresql://sap_app:S3cur3P%40ss!@db.example.com:5432/sap_explorer?sslmode=require&options=-csearch_path%3Dapp"
```

### Uso nel file `.env`

```env
DATABASE_URL=postgresql://<APP_USER>:<APP_PASSWORD>@localhost:5432/<DB_NAME>
```

> **Nota:** Se il `search_path` è già stato impostato con `ALTER ROLE ... SET search_path` (sezione 6), non è necessario specificarlo nella connection string. Il parametro `options=-csearch_path%3D<SCHEMA_NAME>` serve solo come override esplicito o se non si è eseguito l'`ALTER ROLE`.

---

## 10. Errori comuni

| # | Errore | Causa | Soluzione |
|---|---|---|---|
| 1 | `FATAL: database "<DB_NAME>" does not exist` | Typo nel nome o database non creato | Verifica con `\l` e ricrea se necessario |
| 2 | `FATAL: password authentication failed for user "<APP_USER>"` | Password errata o `pg_hba.conf` non configurato | Verifica password con `\password <APP_USER>` e controlla `pg_hba.conf` |
| 3 | `ERROR: permission denied for schema public` | La `REVOKE CREATE ON SCHEMA public` è attiva | Usa lo schema `<SCHEMA_NAME>` oppure fai grant esplicita |
| 4 | `ERROR: relation "mia_tabella" does not exist` | Tabella creata nello schema sbagliato (es. `public` invece di `<SCHEMA_NAME>`) | Controlla `search_path`: `SHOW search_path;` — deve includere `<SCHEMA_NAME>` |
| 5 | `ERROR: permission denied to create extension` | Le estensioni richiedono `SUPERUSER` | Crea le estensioni con l'utente `postgres`, non con `<APP_USER>` |
| 6 | `FATAL: too many connections for role "<APP_USER>"` | Superato il `CONNECTION LIMIT` | Aumenta il limite: `ALTER ROLE <APP_USER> CONNECTION LIMIT 50;` |
| 7 | Drizzle ORM scrive in `public` | `search_path` non configurato, oppure lo schema non è specificato nello schema Drizzle | Aggiungi `{ schema: '<SCHEMA_NAME>' }` nelle table definitions Drizzle, oppure verifica `ALTER ROLE ... SET search_path` |
| 8 | Encoding errato (es. `SQL_ASCII`) | Creato database con `template1` che ha encoding diverso | Ricrea con `TEMPLATE = template0` ed encoding esplicito |
| 9 | Backup di `forge` include anche `<DB_NAME>` | Usato `pg_dumpall` invece di `pg_dump` per singolo DB | Usa `pg_dump -d <DB_NAME>` per backup isolato |
| 10 | Connessione rifiutata da host remoto | `listen_addresses` in `postgresql.conf` impostato su `localhost` | Cambia in `listen_addresses = '*'` (o IP specifico) e aggiungi riga in `pg_hba.conf` |

---

## Riepilogo comandi (copia-incolla rapido)

```bash
# === Esegui tutto come utente postgres ===
sudo -u postgres psql <<'SQL'

-- 1. Role
CREATE ROLE <APP_USER>
  WITH LOGIN PASSWORD '<APP_PASSWORD>'
  NOSUPERUSER NOCREATEDB NOCREATEROLE
  CONNECTION LIMIT 20;

-- 2. Database
CREATE DATABASE <DB_NAME>
  WITH OWNER = <APP_USER>
  ENCODING = 'UTF8'
  LC_COLLATE = 'en_US.UTF-8'
  LC_CTYPE = 'en_US.UTF-8'
  TEMPLATE = template0;

SQL

# === Connettiti al nuovo database ===
sudo -u postgres psql -d <DB_NAME> <<'SQL'

-- 3. Schema
CREATE SCHEMA <SCHEMA_NAME> AUTHORIZATION <APP_USER>;

-- 4. Search path
ALTER ROLE <APP_USER> IN DATABASE <DB_NAME>
  SET search_path = <SCHEMA_NAME>, public;

-- 5. Sicurezza
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- 6. Estensioni (opzionale)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

SQL

# === Verifica ===
sudo -u postgres psql -c "\l" | grep <DB_NAME>
sudo -u postgres psql -c "\du <APP_USER>"
sudo -u postgres psql -d <DB_NAME> -c "\dn+"
```

---

*Documento generato per il progetto Synapse SAP Explorer. Ultima revisione: marzo 2026.*
