const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { AnchorProvider } = require('@coral-xyz/anchor');
const { SapClient, SAP_PROGRAM_ID } = require('@oobe-protocol-labs/synapse-sap-sdk');
const { serializeAccount } = require('@oobe-protocol-labs/synapse-sap-sdk/utils');

const conn = new Connection('https://us-1-mainnet.oobeprotocol.ai', {
  commitment: 'confirmed',
  httpHeaders: { 'x-api-key': process.env.SYNAPSE_API_KEY || '' }
});

const kp = Keypair.generate();
const wallet = { publicKey: kp.publicKey, signTransaction: async (t) => t, signAllTransactions: async (t) => t };
const provider = new AnchorProvider(conn, wallet, { commitment: 'confirmed' });
const sap = SapClient.from(provider, SAP_PROGRAM_ID);

(async () => {
  try {
    const accounts = sap.program.account.toolDescriptor;
    const raw = await accounts.all();
    const tools = raw.map(t => ({ pda: t.publicKey, descriptor: t.account }));
    console.log('Tools found:', tools.length);
    for (const t of tools.slice(0, 10)) {
      const d = t.descriptor;
      if (!d) continue;
      const pda = t.pda.toBase58();
      const name = d.toolName;
      const invRaw = d.totalInvocations;
      console.log(`\n--- ${name} (${pda.slice(0,12)}...) ---`);
      console.log('  totalInvocations raw:', invRaw);
      console.log('  typeof:', typeof invRaw);
      if (invRaw && typeof invRaw === 'object') {
        console.log('  .toString():', invRaw.toString());
        try { console.log('  .toNumber():', invRaw.toNumber()); } catch(e) { console.log('  .toNumber() error:', e.message); }
      }
      
      // Check serialized version
      const serialized = serializeAccount(d);
      console.log('  serialized.totalInvocations:', serialized.totalInvocations);
      console.log('  typeof serialized:', typeof serialized.totalInvocations);
    }
  } catch (e) {
    console.error('Error:', e);
  }
})();
