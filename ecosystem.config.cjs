// ecosystem.config.cjs — PM2 configuration for SAP Indexer
//
// Usage:
//   pm2 start ecosystem.config.cjs
//   pm2 logs sap-indexer
//   pm2 monit
//   pm2 stop sap-indexer
//   pm2 restart sap-indexer
//
// Ensure .env is present in the project root with:
//   DATABASE_URL, SYNAPSE_API_KEY, SYNAPSE_NETWORK, SYNAPSE_REGION

module.exports = {
  apps: [
    {
      name: 'sap-indexer',
      script: 'src/indexer/worker.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx',
      cwd: __dirname,

      // Environment
      env: {
        NODE_ENV: 'production',
        INDEXER_MODE: 'polling',
        // Intervals (ms) — tune as needed
        ENTITY_INTERVAL_MS: '60000',   // 60s — entities (agents, tools, etc.)
        TX_INTERVAL_MS: '20000',       // 20s — transactions
        SNAPSHOT_INTERVAL_MS: '300000', // 5min — network snapshots
      },

      // Process management
      instances: 1,          // single instance (NOT cluster)
      exec_mode: 'fork',     // fork, not cluster — the worker is stateful
      autorestart: true,
      max_restarts: 50,
      min_uptime: '10s',     // consider a restart successful if it runs > 10s
      restart_delay: 5000,   // 5s between restarts

      // Memory guard
      max_memory_restart: '512M',

      // Logs
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/sap-indexer-error.log',
      out_file: './logs/sap-indexer-out.log',
      merge_logs: true,
      log_type: 'raw',

      // Graceful shutdown
      kill_timeout: 10000,   // 10s to handle SIGINT before SIGKILL
      listen_timeout: 5000,

      // Watch (disabled in production — enable for dev if needed)
      watch: false,
    },
  ],
};

