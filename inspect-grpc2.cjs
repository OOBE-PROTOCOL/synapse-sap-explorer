const sdk = require('@oobe-protocol-labs/synapse-client-sdk');
const path = require('path');
const fs = require('fs');

// GeyserParser
const GP = sdk.GeyserParser;
console.log('=== GeyserParser ===');
console.log('proto:', Object.getOwnPropertyNames(GP.prototype));

// Find proto files in SDK
const sdkPath = require.resolve('@oobe-protocol-labs/synapse-client-sdk');
const sdkDir = path.dirname(sdkPath);
console.log('\nSDK entry:', sdkPath);

function findProtos(dir, depth) {
  if (depth > 3) return;
  try {
    for (const e of fs.readdirSync(dir)) {
      const full = path.join(dir, e);
      const stat = fs.statSync(full);
      if (stat.isDirectory() && !e.startsWith('.') && e !== 'node_modules') findProtos(full, depth+1);
      else if (e.endsWith('.proto')) console.log('Proto:', full);
    }
  } catch {}
}
findProtos(path.resolve(sdkDir, '..'), 0);

// Resolved endpoints
const ep = sdk.resolveEndpoint(sdk.SynapseNetwork.Mainnet, sdk.SynapseRegion.US);
console.log('\nEndpoints:', JSON.stringify(ep, null, 2));

// Try SDK GrpcTransport with our proto
const c = new sdk.SynapseClient({
  endpoint: ep.rpc + '?api_key=test',
  grpcEndpoint: ep.grpc_native
});
const g = c.grpc;
console.log('\ngRPC cfg:', JSON.stringify(g.cfg, null, 2));

const protoPath = path.resolve(process.cwd(), 'proto/geyser.proto');
console.log('Proto exists:', fs.existsSync(protoPath));

try {
  g.loadProto(protoPath, 'geyser');
  console.log('Services:', [...g.services.keys()]);
  const svc = g.getService('geyser.Geyser');
  console.log('Geyser service type:', typeof svc);
  if (svc) {
    const p = Object.getPrototypeOf(svc);
    console.log('Geyser methods:', Object.getOwnPropertyNames(p).filter(k => k !== 'constructor'));
  }
} catch(e) { console.log('loadProto error:', e.message); }
