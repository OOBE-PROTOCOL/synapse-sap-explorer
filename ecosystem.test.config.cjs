// ecosystem.test.config.cjs — PM2 configuration for test environment
//
// Usage:
//   pm2 start ecosystem.test.config.cjs
//   pm2 restart sap-explorer-test
//   pm2 logs sap-explorer-test
//   pm2 restart sap-indexer-test
//   pm2 logs sap-indexer-test
//
// Ensure .env is present in the project root with:
//   DATABASE_URL, SYNAPSE_API_KEY, SYNAPSE_NETWORK, SYNAPSE_REGION

module.exports = {
  apps: [
    {
      name: 'sap-explorer-test',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3001',
      cwd: __dirname,

      env: {
        NODE_ENV: 'production',
        APP_ENV: 'test',
        NEXT_PUBLIC_APP_ENV: 'test',
        PORT: 3001,
      },

      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 3000,
      max_memory_restart: '512M',

      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/sap-explorer-test-error.log',
      out_file: './logs/sap-explorer-test-out.log',
      merge_logs: true,
      log_type: 'raw',

      kill_timeout: 10000,
      listen_timeout: 8000,
      watch: false,
    },
    {
      name: 'sap-indexer-test',
      script: 'src/indexer/worker.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx',
      cwd: __dirname,

      env: {
        NODE_ENV: 'production',
        APP_ENV: 'test',
        NEXT_PUBLIC_APP_ENV: 'test',
        INDEXER_MODE: 'polling',
        // Optional dedicated RPC for indexer only
        // INDEXER_RPC_URL: 'https://your-indexer-rpc.example.com',
        // https://us-1-mainnet.oobeprotocol.ai/rpc
        ENTITY_HEALING_INTERVAL_MS: '21600000',
        TX_INTERVAL_MS: '20000',
        SNAPSHOT_INTERVAL_MS: '300000',
      },

      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 50,
      min_uptime: '10s',
      restart_delay: 5000,
      max_memory_restart: '512M',

      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/sap-indexer-test-error.log',
      out_file: './logs/sap-indexer-test-out.log',
      merge_logs: true,
      log_type: 'raw',

      kill_timeout: 10000,
      listen_timeout: 5000,
      watch: false,
    },
  ],
};
