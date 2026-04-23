const { SapClient, SAP_PROGRAM_ID } = require('@oobe-protocol-labs/synapse-sap-sdk');
const { Connection, Keypair } = require('@solana/web3.js');
const { AnchorProvider } = require('@coral-xyz/anchor');
const { resolveEndpoint } = require('@oobe-protocol-labs/synapse-client-sdk');
const ep = resolveEndpoint('mainnet', 'US');
const conn = new Connection(ep.rpc, { commitment: 'confirmed', httpHeaders: { 'x-api-key': process.env.SYNAPSE_API_KEY } });
const kp = Keypair.generate();
const w = { publicKey: kp.publicKey, signTransaction: async t => t, signAllTransactions: async t => t, payer: kp };
const prov = new AnchorProvider(conn, w, { commitment: 'confirmed' });
const sap = SapClient.from(prov, SAP_PROGRAM_ID);
console.log('sap.program?', !!sap.program);
console.log('sap.program.provider?', !!sap.program?.provider);
console.log('sap.program.provider.wallet?', sap.program?.provider?.wallet);
console.log('sap keys:', Object.keys(sap));
console.log('prov.wallet?', prov.wallet);

// Check what SessionManager constructor expects
const fs = require('fs');
const smPath = require.resolve('@oobe-protocol-labs/synapse-sap-sdk/dist/cjs/registries/session.js');
const src = fs.readFileSync(smPath, 'utf8');
const lines = src.split('\n');
// Find the constructor
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('constructor') || lines[i].includes('wallet') || lines[i].includes('program')) {
    if (i >= 70 && i <= 85) console.log(`L${i+1}: ${lines[i]}`);
  }
}
