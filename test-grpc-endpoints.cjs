const sdk = require('@oobe-protocol-labs/synapse-client-sdk');
const path = require('path');
const grpc = require('@grpc/grpc-js');
require('dotenv').config();

const apiKey = process.env.SYNAPSE_API_KEY;
console.log('API key:', apiKey ? apiKey.slice(0, 8) + '...' : 'MISSING');

// The endpoint resolves as grpc://us-1-mainnet.oobeprotocol.ai/grpc-native
// gRPC wants host:port — let's try different combinations

const attempts = [
  { endpoint: 'us-1-mainnet.oobeprotocol.ai:443', tls: true, label: 'host:443 TLS' },
  { endpoint: 'us-1-mainnet.oobeprotocol.ai:80', tls: false, label: 'host:80 plain' },
  { endpoint: 'us-1-mainnet.oobeprotocol.ai', tls: true, label: 'host (no port) TLS' },
  { endpoint: 'us-1-mainnet.oobeprotocol.ai', tls: false, label: 'host (no port) plain' },
];

const protoPath = path.resolve(process.cwd(), 'proto/geyser.proto');

async function tryConnect(endpoint, tls, label) {
  return new Promise((resolve) => {
    const gt = new sdk.GrpcTransport({ endpoint, tls });
    gt.loadProto(protoPath, 'geyser');
    const svc = gt.getService('Geyser');

    const meta = new grpc.Metadata();
    meta.set('x-api-key', apiKey);
    meta.set('x-token', apiKey);

    const stream = svc.Subscribe(meta);
    let resolved = false;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.log(`[${label}] timeout 4s — no response`);
        try { stream.cancel(); } catch {}
        resolve(false);
      }
    }, 4000);

    stream.on('data', (msg) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        console.log(`[${label}] GOT DATA!`, JSON.stringify(msg).slice(0, 100));
        try { stream.cancel(); } catch {}
        resolve(true);
      }
    });

    stream.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        console.log(`[${label}] error: ${err.code} ${err.details || err.message}`);
        resolve(false);
      }
    });

    stream.write({
      transactions: { sap: { vote: false, failed: false, account_include: ['SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ'] } },
      commitment: 1,
      accounts: {},
      slots: {},
    });
  });
}

(async () => {
  for (const a of attempts) {
    await tryConnect(a.endpoint, a.tls, a.label);
  }
  console.log('\nDone');
  process.exit(0);
})();
