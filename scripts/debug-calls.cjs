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
    // Check escrows
    const escrows = await sap.program.account.escrowAccount.all();
    console.log('=== ESCROWS ===');
    console.log('Total escrows:', escrows.length);
    for (const e of escrows) {
      const d = e.account;
      const ser = serializeAccount(d);
      console.log(`\n  PDA: ${e.publicKey.toBase58().slice(0,12)}...`);
      console.log('  totalCallsSettled:', ser.totalCallsSettled);
      console.log('  totalDeposited:', ser.totalDeposited);
      console.log('  totalSettled:', ser.totalSettled);
      console.log('  balance:', ser.balance);
      console.log('  pricePerCall:', ser.pricePerCall);
      console.log('  maxCalls:', ser.maxCalls);
      console.log('  agent:', ser.agent);
    }

    // Check agent stats
    console.log('\n=== AGENT STATS ===');
    const stats = await sap.program.account.agentStats.all();
    console.log('Total stats accounts:', stats.length);
    for (const s of stats) {
      const ser = serializeAccount(s.account);
      console.log(`\n  PDA: ${s.publicKey.toBase58().slice(0,12)}...`);
      console.log('  totalCallsServed:', ser.totalCallsServed);
      console.log('  avgLatencyMs:', ser.avgLatencyMs);
      console.log('  uptimePercent:', ser.uptimePercent);
    }

    // Check agent identity totalCallsServed
    console.log('\n=== AGENT IDENTITY ===');
    const agents = await sap.program.account.agentIdentity.all();
    console.log('Total agents:', agents.length);
    for (const a of agents.slice(0, 5)) {
      const ser = serializeAccount(a.account);
      console.log(`\n  ${ser.name} (${a.publicKey.toBase58().slice(0,12)}...)`);
      console.log('  totalCallsServed:', ser.totalCallsServed);
      console.log('  reputationScore:', ser.reputationScore);
    }

    // Check events for one escrow with non-zero settlements
    const nonZeroEscrow = escrows.find(e => {
      const ser = serializeAccount(e.account);
      return Number(ser.totalCallsSettled) > 0;
    });
    if (nonZeroEscrow) {
      console.log('\n=== TX EVENTS for escrow with settlements ===');
      const pda = nonZeroEscrow.publicKey;
      console.log('Escrow PDA:', pda.toBase58());
      const sigs = await conn.getSignaturesForAddress(pda, { limit: 20 });
      console.log('TX count:', sigs.length);
      
      const eventParser = sap.events;
      for (const sig of sigs.slice(0, 5)) {
        const tx = await conn.getTransaction(sig.signature, { maxSupportedTransactionVersion: 0 });
        if (!tx || !tx.meta) continue;
        const logs = tx.meta.logMessages || [];
        try {
          const events = eventParser.parseLogs(logs);
          if (events.length > 0) {
            console.log(`\n  TX: ${sig.signature.slice(0,20)}...`);
            for (const evt of events) {
              const data = {};
              for (const [k, v] of Object.entries(evt.data)) {
                if (v && typeof v === 'object' && v.toBase58) data[k] = v.toBase58().slice(0,12) + '...';
                else if (v && typeof v === 'object' && v.toNumber) data[k] = v.toNumber();
                else data[k] = v;
              }
              console.log(`    Event: ${evt.name}`, JSON.stringify(data));
            }
          }
        } catch (e) {
          console.log(`  Failed to parse logs for ${sig.signature.slice(0,12)}:`, e.message);
        }
      }
    }

  } catch (e) {
    console.error('Error:', e);
  }
})();
