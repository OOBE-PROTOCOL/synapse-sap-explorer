# PostgreSQL Database Creation — Operational Runbook

> Step-by-step guide to create a new dedicated PostgreSQL database for a new application, on a server where PostgreSQL is already installed and running.

---

## 1. Purpose

Create a separate PostgreSQL database, with a dedicated role and schema, for a new application — keeping it isolated from the already existing `forge` database.

**Placeholders to replace throughout this guide:**

| Placeholder | Description | Example |
|---|---|---|
| `<DB_NAME>` | Name of the new database | `sap_explorer` |
| `<APP_USER>` | Application role/user | `sap_app` |
| `<APP_PASSWORD>` | Application role password | `S3cur3P@ss!` |
| `<SCHEMA_NAME>` | Dedicated schema in the new database | `app` |

---

## 2. Recommended choice: new database or new schema?

| Criterion | New Schema (same DB) | New Database |
|---|---|---|
| Different and independent applications | ✗ | **✓** |
| Sharing tables between apps | **✓** | ✗ |
| Independent backup/restore | ✗ | **✓** |
| Full connection isolation | ✗ | **✓** |
| Cross-query between the two apps | **✓** | ✗ (requires `dblink`/`fdw`) |
| Separate lifecycle (drop, migrate) | Risky | **✓** |

### Verdict for this case

**→ New database.** The two applications are independent, do not share tables, and must have separate backup/deploy/migrate lifecycles. Inside the new database we will still create a **dedicated schema** (other than `public`) to maintain order and enable future multi-schema extensions.

---

## 3. Prerequisites

- PostgreSQL installed and running (`systemctl status postgresql`)
- Server access as a user with PostgreSQL superuser privileges (typically `postgres`)
- The `forge` database already present (it will not be touched)

```bash
# Verify that PostgreSQL is running
sudo systemctl status postgresql

# List existing databases
sudo -u postgres psql -c "\l"
```

### 3.1 Infrastructure checks

Before proceeding, check the current PostgreSQL instance configuration:

```bash
# Listen address (localhost, *, specific IP)
sudo -u postgres psql -c "SHOW listen_addresses;"

# Port in use
sudo -u postgres psql -c "SHOW port;"

# Path to pg_hba.conf (authentication)
sudo -u postgres psql -c "SHOW hba_file;"

# Path to postgresql.conf (main configuration)
sudo -u postgres psql -c "SHOW config_file;"

# Data directory (PGDATA)
sudo -u postgres psql -c "SELECT current_setting('data_directory');"
```

> **Why these checks?**
> - `listen_addresses` → confirms whether the server accepts remote connections or only local ones.
> - `port` → ensures the port is the expected one (default `5432`).
> - `hba_file` → locates the file to edit if you need to add access rules for the new role.
> - `config_file` → useful if you need to change `listen_addresses` or other parameters.
> - `data_directory` → useful for backups, logs, and troubleshooting.

---

## 4. Application role creation

We create a dedicated role with `LOGIN` and a password. We do not assign `SUPERUSER` or `CREATEDB` — principle of least privilege.

```bash
sudo -u postgres psql <<'SQL'
-- Create the application role
CREATE ROLE <APP_USER>
  WITH LOGIN
       PASSWORD '<APP_PASSWORD>'
       NOSUPERUSER
       NOCREATEDB
       NOCREATEROLE
       INHERIT
       CONNECTION LIMIT 20;

COMMENT ON ROLE <APP_USER> IS 'Application role for <DB_NAME>';
SQL
```

> **Note:** `CONNECTION LIMIT 20` is a reasonable example. Adjust the value to your application's connection pool (e.g., if using `pg` with `Pool({ max: 10 })`, a limit of 20 leaves room for maintenance connections).

---

## 5. New database creation

```bash
sudo -u postgres psql <<'SQL'
-- Create the database assigning the role as owner
CREATE DATABASE <DB_NAME>
  WITH OWNER = <APP_USER>
       ENCODING = 'UTF8'
       LC_COLLATE = 'en_US.UTF-8'
       LC_CTYPE = 'en_US.UTF-8'
       TEMPLATE = template0;

COMMENT ON DATABASE <DB_NAME> IS 'Database for <DB_NAME> application';
SQL
```

> **Why `TEMPLATE = template0`?** It guarantees a clean database with the correct encoding, without objects inherited from `template1`.

> **Why `OWNER = <APP_USER>`?** The owner can create/drop tables, schemas, and indexes in their own database without needing additional grants.

---

## 6. Dedicated schema creation

Connect to the **new** database and create the schema.

```bash
sudo -u postgres psql -d <DB_NAME> <<'SQL'
-- Create the dedicated schema
CREATE SCHEMA <SCHEMA_NAME> AUTHORIZATION <APP_USER>;

-- Set the schema as the default in the role's search_path
ALTER ROLE <APP_USER> IN DATABASE <DB_NAME>
  SET search_path = <SCHEMA_NAME>, public;

-- Revoke permissions on the public schema for security
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

COMMENT ON SCHEMA <SCHEMA_NAME> IS 'Main application schema for <DB_NAME>';
SQL
```

> **Why not just use `public`?** The `public` schema is accessible by default to all roles. A dedicated schema offers isolation and more granular permission control.

---

## 7. Recommended permissions and settings

```bash
sudo -u postgres psql -d <DB_NAME> <<'SQL'
-- The role is the owner of the DB and the schema, so it already has permissions.
-- We add explicit grants for clarity and for potential future roles.

-- Schema permissions
GRANT USAGE  ON SCHEMA <SCHEMA_NAME> TO <APP_USER>;
GRANT CREATE ON SCHEMA <SCHEMA_NAME> TO <APP_USER>;

-- Default permissions on future objects created in the new schema
ALTER DEFAULT PRIVILEGES
  IN SCHEMA <SCHEMA_NAME>
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO <APP_USER>;

ALTER DEFAULT PRIVILEGES
  IN SCHEMA <SCHEMA_NAME>
  GRANT USAGE, SELECT ON SEQUENCES TO <APP_USER>;

-- (Optional) Enable useful extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;       -- fuzzy search, GIN trigram indexes
CREATE EXTENSION IF NOT EXISTS pgcrypto;       -- gen_random_uuid(), hashing

SQL
```

> **Best practice pg_hba.conf:** Verify that the `pg_hba.conf` file allows the role to connect to the new database. Example line to add (if needed):
>
> ```
> # TYPE  DATABASE     USER        ADDRESS         METHOD
> host    <DB_NAME>    <APP_USER>  127.0.0.1/32    scram-sha-256
> host    <DB_NAME>    <APP_USER>  ::1/128         scram-sha-256
> ```
>
> After the change:
> ```bash
> sudo systemctl reload postgresql
> ```

---

## 8. Final verifications

### 8.1 Verify database

```bash
sudo -u postgres psql -c "\l" | grep <DB_NAME>
```

Expected output:
```
 <DB_NAME> | <APP_USER> | UTF8 | en_US.UTF-8 | en_US.UTF-8 |
```

### 8.2 Verify role

```bash
sudo -u postgres psql -c "\du <APP_USER>"
```

Expected output:
```
                        List of roles
 Role name | Attributes
-----------+-----------
 <APP_USER> | 20 connections
```

### 8.3 Verify schema

```bash
sudo -u postgres psql -d <DB_NAME> -c "\dn+"
```

Expected output:
```
       List of schemas
    Name     |  Owner     | ...
-------------+------------+----
 <SCHEMA_NAME> | <APP_USER> |
 public        | postgres   |
```

### 8.4 Verify search_path

```bash
sudo -u postgres psql -d <DB_NAME> -c "SHOW search_path;" -U <APP_USER>
```

Expected output:
```
 search_path
--------------
 <SCHEMA_NAME>, public
```

### 8.5 Application connection test

```bash
psql "postgresql://<APP_USER>:<APP_PASSWORD>@localhost:5432/<DB_NAME>?schema=<SCHEMA_NAME>" \
  -c "SELECT current_database(), current_user, current_schema();"
```

Expected output:
```
 current_database | current_user | current_schema
------------------+--------------+----------------
 <DB_NAME>        | <APP_USER>   | <SCHEMA_NAME>
```

### 8.6 Table creation test (smoke test)

```bash
psql "postgresql://<APP_USER>:<APP_PASSWORD>@localhost:5432/<DB_NAME>" <<'SQL'
CREATE TABLE <SCHEMA_NAME>._test_connection (id serial PRIMARY KEY, ts timestamptz DEFAULT now());
INSERT INTO <SCHEMA_NAME>._test_connection DEFAULT VALUES;
SELECT * FROM <SCHEMA_NAME>._test_connection;
DROP TABLE <SCHEMA_NAME>._test_connection;
SQL
```

---

## 9. Example connection string

### Standard URI format

```
postgresql://<APP_USER>:<APP_PASSWORD>@<HOST>:5432/<DB_NAME>?options=-csearch_path%3D<SCHEMA_NAME>
```

### Concrete examples

```bash
# Local connection
DATABASE_URL="postgresql://sap_app:S3cur3P%40ss!@localhost:5432/sap_explorer?options=-csearch_path%3Dapp"

# Remote connection with SSL
DATABASE_URL="postgresql://sap_app:S3cur3P%40ss!@db.example.com:5432/sap_explorer?sslmode=require&options=-csearch_path%3Dapp"
```

### Usage in the `.env` file

```env
DATABASE_URL=postgresql://<APP_USER>:<APP_PASSWORD>@localhost:5432/<DB_NAME>
```

> **Note:** If the `search_path` has already been set with `ALTER ROLE ... SET search_path` (section 6), you don't need to specify it in the connection string. The `options=-csearch_path%3D<SCHEMA_NAME>` parameter is only needed as an explicit override or if the `ALTER ROLE` was not executed.

---

## 10. Common errors

| # | Error | Cause | Solution |
|---|---|---|---|
| 1 | `FATAL: database "<DB_NAME>" does not exist` | Typo in the name or database not created | Verify with `\l` and recreate if needed |
| 2 | `FATAL: password authentication failed for user "<APP_USER>"` | Wrong password or `pg_hba.conf` not configured | Verify password with `\password <APP_USER>` and check `pg_hba.conf` |
| 3 | `ERROR: permission denied for schema public` | The `REVOKE CREATE ON SCHEMA public` is active | Use the `<SCHEMA_NAME>` schema or grant explicit permissions |
| 4 | `ERROR: relation "my_table" does not exist` | Table created in the wrong schema (e.g., `public` instead of `<SCHEMA_NAME>`) | Check `search_path`: `SHOW search_path;` — it must include `<SCHEMA_NAME>` |
| 5 | `ERROR: permission denied to create extension` | Extensions require `SUPERUSER` | Create extensions with the `postgres` user, not with `<APP_USER>` |
| 6 | `FATAL: too many connections for role "<APP_USER>"` | Exceeded the `CONNECTION LIMIT` | Increase the limit: `ALTER ROLE <APP_USER> CONNECTION LIMIT 50;` |
| 7 | Drizzle ORM writes to `public` | `search_path` not configured, or schema not specified in Drizzle schema definitions | Add `{ schema: '<SCHEMA_NAME>' }` in the Drizzle table definitions, or verify `ALTER ROLE ... SET search_path` |
| 8 | Wrong encoding (e.g., `SQL_ASCII`) | Database created with `template1` that has a different encoding | Recreate with `TEMPLATE = template0` and explicit encoding |
| 9 | Backup of `forge` also includes `<DB_NAME>` | Used `pg_dumpall` instead of `pg_dump` for a single DB | Use `pg_dump -d <DB_NAME>` for isolated backup |
| 10 | Connection refused from remote host | `listen_addresses` in `postgresql.conf` set to `localhost` | Change to `listen_addresses = '*'` (or specific IP) and add a line in `pg_hba.conf` |

---

## Quick copy-paste command summary

```bash
# === Run everything as the postgres user ===
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

# === Connect to the new database ===
sudo -u postgres psql -d <DB_NAME> <<'SQL'

-- 3. Schema
CREATE SCHEMA <SCHEMA_NAME> AUTHORIZATION <APP_USER>;

-- 4. Search path
ALTER ROLE <APP_USER> IN DATABASE <DB_NAME>
  SET search_path = <SCHEMA_NAME>, public;

-- 5. Security
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- 6. Extensions (optional)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

SQL

# === Verify ===
sudo -u postgres psql -c "\l" | grep <DB_NAME>
sudo -u postgres psql -c "\du <APP_USER>"
sudo -u postgres psql -d <DB_NAME> -c "\dn+"
```

---

*Document generated for the Synapse SAP Explorer project. Last revision: March 2026.*

