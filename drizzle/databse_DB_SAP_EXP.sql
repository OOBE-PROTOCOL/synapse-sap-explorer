-- ============================================================================
-- MIGRATION: Creazione completa database DB_SAP_EXP
-- Eseguire come superuser postgres:
--   sudo -u postgres psql -f databse_DB_SAP_EXP.sql
--
-- Valori utilizzati:
--   DB_NAME      = DB_SAP_EXP
--   APP_USER     = user_db_sap_exp
--   APP_PASSWORD = p@ss!S3Cur3
--   SCHEMA_NAME  = sap_exp
-- ============================================================================


-- ============================================================================
-- 1. CREAZIONE ROLE APPLICATIVO
-- ============================================================================

CREATE ROLE user_db_sap_exp
    WITH LOGIN
         PASSWORD 'p@ss!S3Cur3'
         NOSUPERUSER
         NOCREATEDB
         NOCREATEROLE
         INHERIT
         CONNECTION LIMIT 30;

COMMENT ON ROLE user_db_sap_exp IS 'Role applicativo per DB_SAP_EXP';


-- ============================================================================
-- 2. CREAZIONE DATABASE
-- ============================================================================

CREATE DATABASE "DB_SAP_EXP"
    WITH OWNER = user_db_sap_exp
         ENCODING = 'UTF8'
         LC_COLLATE = 'en_US.UTF-8'
         LC_CTYPE = 'en_US.UTF-8'
         TEMPLATE = template0;

COMMENT ON DATABASE "DB_SAP_EXP" IS 'Database per applicazione DB_SAP_EXP';


-- ============================================================================
-- 3. CONNESSIONE AL NUOVO DATABASE
-- ============================================================================

\connect "DB_SAP_EXP"


-- ============================================================================
-- 4. CREAZIONE SCHEMA DEDICATO
-- ============================================================================

CREATE SCHEMA sap_exp AUTHORIZATION user_db_sap_exp;

COMMENT ON SCHEMA sap_exp IS 'Schema applicativo principale per DB_SAP_EXP';


-- ============================================================================
-- 5. SEARCH PATH
-- ============================================================================

ALTER ROLE user_db_sap_exp IN DATABASE "DB_SAP_EXP"
    SET search_path = sap_exp, public;


-- ============================================================================
-- 6. SICUREZZA — Revoca permessi su schema public
-- ============================================================================

REVOKE CREATE ON SCHEMA public FROM PUBLIC;


-- ============================================================================
-- 7. PERMESSI ESPLICITI SULLO SCHEMA
-- ============================================================================

GRANT USAGE  ON SCHEMA sap_exp TO user_db_sap_exp;
GRANT CREATE ON SCHEMA sap_exp TO user_db_sap_exp;


-- ============================================================================
-- 8. DEFAULT PRIVILEGES — Grant automatiche sugli oggetti futuri
-- ============================================================================

ALTER DEFAULT PRIVILEGES
    IN SCHEMA sap_exp
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO user_db_sap_exp;

ALTER DEFAULT PRIVILEGES
    IN SCHEMA sap_exp
    GRANT USAGE, SELECT ON SEQUENCES TO user_db_sap_exp;


-- ============================================================================
-- 9. ESTENSIONI (opzionale)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- fuzzy search, indici GIN trigram
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid(), hashing


-- ============================================================================
-- 10. VERIFICHE
-- ============================================================================

-- Verifica database
SELECT datname, pg_catalog.pg_get_userbyid(datdba) AS owner, encoding, datcollate
FROM pg_database
WHERE datname = 'DB_SAP_EXP';

-- Verifica role
SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolconnlimit
FROM pg_roles
WHERE rolname = 'user_db_sap_exp';

-- Verifica schema
SELECT schema_name, schema_owner
FROM information_schema.schemata
WHERE catalog_name = 'DB_SAP_EXP'
  AND schema_name IN ('sap_exp', 'public');

-- Verifica search_path
SELECT rolname, datname, setconfig
FROM pg_db_role_setting
JOIN pg_roles    ON pg_roles.oid    = pg_db_role_setting.setrole
JOIN pg_database ON pg_database.oid = pg_db_role_setting.setdatabase
WHERE rolname = 'user_db_sap_exp'
  AND datname = 'DB_SAP_EXP';

-- Verifica estensioni installate
SELECT extname, extversion
FROM pg_extension
WHERE extname IN ('pg_trgm', 'pgcrypto');


-- ============================================================================
-- 11. SMOKE TEST — Crea e distruggi tabella di test
-- ============================================================================

CREATE TABLE sap_exp._test_connection (
    id SERIAL PRIMARY KEY,
    ts TIMESTAMPTZ DEFAULT now()
);

INSERT INTO sap_exp._test_connection DEFAULT VALUES;
SELECT * FROM sap_exp._test_connection;
DROP TABLE sap_exp._test_connection;


-- ============================================================================
-- DONE
-- Connection string di esempio:
--   postgresql://user_db_sap_exp:p%40ss!S3Cur3@localhost:5432/DB_SAP_EXP
-- ============================================================================

-- Per eseguirlo: sudo -u postgres psql -f databse_DB_SAP_EXP.sql
