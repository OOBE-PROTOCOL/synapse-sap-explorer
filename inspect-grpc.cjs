const sdk = require('@oobe-protocol-labs/synapse-client-sdk');
const SynapseClient = sdk.SynapseClient;
const c = new SynapseClient({ endpoint: 'https://us-1-mainnet.oobeprotocol.ai/rpc?api_key=test' });
const g = c.grpc;

console.log('=== GrpcTransport ===');
console.log('Own keys:', Object.keys(g));
console.log('Proto methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(g)));
console.log('cfg:', JSON.stringify(g.cfg, null, 2));

const proto = Object.getPrototypeOf(g);
for (const key of Object.getOwnPropertyNames(proto)) {
  const desc = Object.getOwnPropertyDescriptor(proto, key);
  if (desc && typeof desc.value === 'function') {
    console.log('Method:', key, '- arity:', desc.value.length);
    // Try to read source
    const src = desc.value.toString().slice(0, 300);
    console.log('  src:', src);
  }
}

// Try ensureLoaded
try {
  g.ensureLoaded();
  console.log('\nServices after load:', Object.keys(g.services || {}));
  // Inspect each service
  for (const [name, svc] of Object.entries(g.services || {})) {
    console.log(`Service ${name}:`, typeof svc);
    if (svc && typeof svc === 'object') {
      console.log('  keys:', Object.keys(svc));
      // Check if it's a gRPC client
      const p = Object.getPrototypeOf(svc);
      if (p) console.log('  proto:', Object.getOwnPropertyNames(p).filter(k => k !== 'constructor'));
    }
  }
} catch(e) { console.log('ensureLoaded error:', e.message); }

// Check GrpcTransport class
const GT = sdk.GrpcTransport;
if (GT) {
  console.log('\n=== GrpcTransport static ===');
  console.log('proto:', Object.getOwnPropertyNames(GT.prototype));
}

// Check parseGeyserUpdate
console.log('\n=== Parsing utils ===');
console.log('parseGeyserUpdate:', typeof sdk.parseGeyserUpdate);
console.log('parseTransaction:', typeof sdk.parseTransaction);
console.log('GeyserParser:', typeof sdk.GeyserParser);

// resolveEndpoint
try {
  const ep = sdk.resolveEndpoint(sdk.SynapseNetwork.Mainnet, sdk.SynapseRegion.US);
  console.log('\n=== resolveEndpoint ===');
  console.log(JSON.stringify(ep, null, 2));
} catch(e) { console.log('resolveEndpoint error:', e.message); }
