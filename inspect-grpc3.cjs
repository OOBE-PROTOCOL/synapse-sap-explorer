const sdk = require('@oobe-protocol-labs/synapse-client-sdk');
const path = require('path');

const ep = sdk.resolveEndpoint(sdk.SynapseNetwork.Mainnet, sdk.SynapseRegion.US);

// Use SDK GrpcTransport with grpc_native endpoint 
const c = new sdk.SynapseClient({
  endpoint: ep.rpc + '?api_key=test',
  grpcEndpoint: ep.grpc_native
});
const g = c.grpc;

const protoPath = path.resolve(process.cwd(), 'proto/geyser.proto');
g.loadProto(protoPath, 'geyser');
console.log('Services:', [...g.services.keys()]);

// Get service as "Geyser" (not "geyser.Geyser")
const svc = g.getService('Geyser');
console.log('Geyser service type:', typeof svc);
if (svc) {
  const p = Object.getPrototypeOf(svc);
  const methods = Object.getOwnPropertyNames(p).filter(k => k !== 'constructor');
  console.log('Geyser methods:', methods);
  
  // Check what subscribe looks like
  for (const m of methods) {
    const fn = svc[m];
    if (typeof fn === 'function') {
      console.log(`  ${m}() arity=${fn.length}`);
    }
  }
}

// Now try with a real API key and the grpc_native endpoint
console.log('\n=== Testing connection to grpc_native endpoint ===');
console.log('Endpoint:', ep.grpc_native);

// Check SDK cfg structure  
const GT = sdk.GrpcTransport;
const gt2 = new GT({ 
  endpoint: ep.grpc_native,
  apiKey: 'test-key',
  tls: false  // grpc:// not grpcs://
});
console.log('GT cfg:', JSON.stringify(gt2.cfg, null, 2));

// Also try the regular grpc endpoint
const gt3 = new GT({
  endpoint: ep.grpc,
  apiKey: 'test-key', 
  tls: true
});
console.log('GT cfg (grpc):', JSON.stringify(gt3.cfg, null, 2));
