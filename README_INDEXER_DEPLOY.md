# Indexer Production Deployment Guide

> How to run the SAP Indexer Worker in production — polling mode with PM2 or CRON.

---

## Context

The indexer worker supports three modes:

| Mode | Transport | Status |
|---|---|---|
| `polling` | JSON-RPC via Synapse SDK | ✅ **Production ready** |
| `stream` | gRPC via Yellowstone | ❌ Blocked (Synapse expects `x-api-key` metadata, Yellowstone sends `x-token`) |
| `hybrid` | Both | ❌ Blocked (same gRPC issue) |

**→ Use `INDEXER_MODE=polling` for production.** This is now the default.

---

## What the Indexer Does

Every cycle it:

1. **Entities** (every 60s) — fetches all agents, tools, escrows, attestations, feedbacks, vaults from on-chain PDAs and upserts them into PostgreSQL
2. **Transactions** (every 20s) — fetches recent SAP program transactions, parses instructions, and stores them
3. **Snapshots** (every 5min) — captures network-wide metrics (agent count, tool count, etc.) for historical charts

All intervals are configurable via environment variables.

---

## Option A: PM2 Daemon (Recommended)

PM2 keeps the worker running as a long-lived process with automatic restarts, log rotation, and monitoring.

### Prerequisites

```bash
# Install PM2 globally
npm install -g pm2
```

### Setup

```bash
cd /path/to/synapse-sap-explorer

# Ensure .env exists with DATABASE_URL, SYNAPSE_API_KEY, etc.
cp .env.example .env
# Edit .env with your values

# Create logs directory
mkdir -p logs

# Start the indexer
pm2 start ecosystem.config.cjs

# Verify it's running
pm2 status
pm2 logs sap-indexer --lines 50
```

### Useful PM2 Commands

```bash
pm2 status                    # Process list
pm2 logs sap-indexer          # Tail logs
pm2 monit                     # Real-time dashboard
pm2 restart sap-indexer       # Restart
pm2 stop sap-indexer          # Stop
pm2 delete sap-indexer        # Remove from PM2

# Persist across server reboot
pm2 save
pm2 startup                   # Generates systemd/launchd auto-start script
```

### Tuning Intervals

Override in `ecosystem.config.cjs` → `env` section, or set in `.env`:

```env
ENTITY_INTERVAL_MS=60000      # 60s — how often to re-sync entities
TX_INTERVAL_MS=20000           # 20s — how often to poll transactions
SNAPSHOT_INTERVAL_MS=300000    # 5min — how often to capture snapshots
```

Lower `TX_INTERVAL_MS` = fresher data, but more RPC calls. At 20s with `limit=50` and 200ms pacing, worst case is ~250 RPC calls/min. Check your Synapse plan limits.

---

## Option B: CRON + `--once` (Lightweight Alternative)

For VPS or environments where you don't want a long-running daemon. Each invocation runs one full cycle and exits.

### Setup

```bash
# Edit crontab
crontab -e
```

Add:

```cron
# SAP Indexer — run every 2 minutes
*/2 * * * * cd /path/to/synapse-sap-explorer && /usr/local/bin/npx tsx src/indexer/worker.ts --once >> /var/log/sap-indexer.log 2>&1

# Health check — run every 10 minutes (optional)
*/10 * * * * cd /path/to/synapse-sap-explorer && /usr/local/bin/npx tsx src/indexer/healthcheck.ts >> /var/log/sap-indexer-health.log 2>&1
```

> **Anti-overlap protection**: The `--once` mode creates a lockfile (`$TMPDIR/sap-indexer.lock`). If a previous run is still executing when CRON fires again, it exits immediately without overlap.

### Trade-offs

- Data freshness: ~2-5 min (depends on CRON interval)
- No persistent process consuming memory between runs
- Simpler but less responsive than PM2 daemon

---

## Option C: systemd Service

If you prefer native Linux service management:

```ini
# /etc/systemd/system/sap-indexer.service
[Unit]
Description=SAP Indexer Worker
After=network.target postgresql.service

[Service]
Type=simple
User=deploy
WorkingDirectory=/path/to/synapse-sap-explorer
EnvironmentFile=/path/to/synapse-sap-explorer/.env
ExecStart=/usr/local/bin/npx tsx src/indexer/worker.ts
Restart=always
RestartSec=5
KillSignal=SIGTERM
TimeoutStopSec=10

# Env overrides
Environment=NODE_ENV=production
Environment=INDEXER_MODE=polling

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable sap-indexer
sudo systemctl start sap-indexer
sudo journalctl -u sap-indexer -f    # tail logs
```

---

## Health Check

Run manually or via CRON/monitoring:

```bash
pnpm indexer:health
```

Output example:
```
✅ OK    agents           last_sync=45s ago   (max=900s)
✅ OK    tools            last_sync=47s ago   (max=900s)
✅ OK    transactions     last_sync=12s ago   (max=600s)
✅ OK    escrows          last_sync=50s ago   (max=900s)

✅ Indexer is healthy.
```

Exit code `0` = healthy, `1` = stale data. Integrate with UptimeRobot, Datadog, etc.

Configurable thresholds via env:
```env
HEALTH_ENTITY_MAX_AGE_MS=900000    # 15 min
HEALTH_TX_MAX_AGE_MS=600000        # 10 min
```

---

## Environment Variables Summary

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `SYNAPSE_API_KEY` | ✅ | — | Synapse SDK API key |
| `SYNAPSE_NETWORK` | | `mainnet` | `mainnet`, `devnet`, `testnet` |
| `SYNAPSE_REGION` | | `US` | `US`, `EU` |
| `INDEXER_MODE` | | `polling` | `polling` (recommended), `stream`, `hybrid` |
| `ENTITY_INTERVAL_MS` | | `60000` | Entity sync interval (ms) |
| `TX_INTERVAL_MS` | | `20000` | Transaction polling interval (ms) |
| `SNAPSHOT_INTERVAL_MS` | | `300000` | Snapshot interval (ms) |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────┐
│                Production Server                 │
│                                                  │
│  ┌──────────┐    JSON-RPC     ┌──────────────┐  │
│  │  PM2     │ ──────────────→ │  Synapse RPC │  │
│  │  sap-    │    (polling)    │  endpoint    │  │
│  │  indexer │                 └──────────────┘  │
│  └────┬─────┘                                    │
│       │ SQL                                      │
│       ▼                                          │
│  ┌──────────┐         ┌──────────────────────┐  │
│  │PostgreSQL│ ◀────── │  Next.js App         │  │
│  │DB_SAP_EXP│  reads  │  (API routes /api/*) │  │
│  └──────────┘         └──────────────────────┘  │
└─────────────────────────────────────────────────┘
```

The indexer writes to PostgreSQL. The Next.js frontend reads from it via API routes. They are completely independent processes.

---

## Quick Start (TL;DR)

```bash
# 1. Install PM2
npm i -g pm2

# 2. Create logs dir
mkdir -p logs

# 3. Start
pm2 start ecosystem.config.cjs

# 4. Verify
pm2 logs sap-indexer --lines 30

# 5. Persist across reboot
pm2 save && pm2 startup

# 6. Health check
pnpm indexer:health
```

```bash
# 1. Installa PM2
npm i -g pm2

# 2. Crea cartella logs
mkdir -p logs

# 3. Avvia l'indexer
pm2 start ecosystem.config.cjs

# 4. Verifica
pm2 logs sap-indexer --lines 30

# 5. Persisti al reboot
pm2 save && pm2 startup

# 6. Health check
pnpm indexer:health
```

What to do in polling 

```bash
Ogni 20s  → poll transazioni SAP (getSignaturesForAddress + getTransaction)
Ogni 60s  → sync entità (agents → tools → escrows → attestations → feedbacks → vaults)
Ogni 5min → snapshot metriche di rete
```

---

*Last updated: March 2026*

