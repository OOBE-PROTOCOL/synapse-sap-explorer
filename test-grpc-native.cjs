const sdk = require('@oobe-protocol-labs/synapse-client-sdk');
const path = require('path');
require('dotenv').config();

const ep = sdk.resolveEndpoint(sdk.SynapseNetwork.Mainnet, sdk.SynapseRegion.US);
const apiKey = process.env.SYNAPSE_API_KEY;

console.log('API key:', apiKey ? apiKey.slice(0,8) + '...' : 'MISSING');
console.log('grpc_native endpoint:', ep.grpc_native);

// Use GrpcTransport directly with grpc_native endpoint
const gt = new sdk.GrpcTransport({
  endpoint: ep.grpc_native,
  apiKey: apiKey,
  tls: false
});

const protoPath = path.resolve(process.cwd(), 'proto/geyser.proto');
gt.loadProto(protoPath, 'geyser');
const svc = gt.getService('Geyser');

// Check how getService parses the endpoint internally
console.log('Service created successfully');

// Try Subscribe bidi stream
const grpc = require('@grpc/grpc-js');
const meta = new grpc.Metadata();
meta.set('x-api-key', apiKey);

console.log('\nAttempting Subscribe...');
const stream = svc.Subscribe(meta);

const timeout = setTimeout(() => {
  console.log('Timeout - no response after 5s');
  stream.cancel();
  process.exit(1);
}, 5000);

stream.on('data', (msg) => {
  console.log('Got data:', JSON.stringify(msg).slice(0, 200));
  clearTimeout(timeout);
});

stream.on('error', (err) => {
  console.log('Stream error:', err.code, err.details || err.message);
  clearTimeout(timeout);
});

stream.on('end', () => {
  console.log('Stream ended');
  clearTimeout(timeout);
});

// Send subscribe request
stream.write({
  transactions: {
    sap: {
      vote: false,
      failed: false,
      account_include: ['SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ'],
      account_exclude: [],
      account_required: [],
    }
  },
  commitment: 1, // CONFIRMED
  accounts: {},
  slots: {},
  transactions_status: {},
  blocks: {},
  blocks_meta: {},
  entry: {},
  accounts_data_slice: [],
});
console.log('Subscribe request sent');
