const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { AnchorProvider } = require('@coral-xyz/anchor');
const { SapClient, SAP_PROGRAM_ID, deriveSession, deriveVault, SessionManager } = require('@oobe-protocol-labs/synapse-sap-sdk');
const { resolveEndpoint } = require('@oobe-protocol-labs/synapse-client-sdk');

const ep = resolveEndpoint('mainnet', 'US');
const conn = new Connection(ep.rpc, {
  commitment: 'confirmed',
  httpHeaders: { 'x-api-key': process.env.SYNAPSE_API_KEY },
});
const wallet = { publicKey: Keypair.generate().publicKey, signTransaction: async (t) => t, signAllTransactions: async (t) => t };
const provider = new AnchorProvider(conn, wallet, { commitment: 'confirmed' });
const sap = SapClient.from(provider, SAP_PROGRAM_ID);

const vaultPda = new PublicKey('2wfPyWiVbWTTo1ua7zhEpaYj97R1K1tq4QJ4hMcGmrV4');

(async () => {
  // 1. All sessionLedger accounts (no filter)
  console.log('=== ALL SESSION LEDGER ACCOUNTS ===');
  try {
    const all = await sap.program.account.sessionLedger.all();
    console.log(all.length, 'total');
    for (const s of all) {
      const d = s.account;
      console.log(JSON.stringify({
        pda: s.publicKey.toBase58(),
        vault: d.vault?.toBase58?.(),
        sessionHash: d.sessionHash ? Buffer.from(d.sessionHash).toString('hex') : null,
        isClosed: d.isClosed,
        totalEntries: d.totalEntries,
        totalDataSize: d.totalDataSize?.toString(),
      }));
    }
  } catch (e) { console.log('Error:', e.message); }

  // 2. Check all account types in the program IDL
  console.log('\n=== PROGRAM ACCOUNT TYPES ===');
  const accTypes = Object.keys(sap.program.account);
  console.log(accTypes.join(', '));

  // 3. Check all memory-related account types
  for (const accType of accTypes) {
    if (/memory|vault|session|ledger|epoch|chunk|buffer|digest|inscri/i.test(accType)) {
      try {
        const all = await sap.program.account[accType].all();
        console.log(`\n${accType}: ${all.length} accounts`);
        if (all.length > 0 && all.length <= 10) {
          for (const a of all) {
            const d = a.account;
            const summary = {};
            for (const [k, v] of Object.entries(d)) {
              if (v && typeof v === 'object' && 'toBase58' in v) summary[k] = v.toBase58();
              else if (v && typeof v === 'object' && 'toString' in v && typeof v.length === 'undefined') summary[k] = v.toString();
              else if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') summary[k] = v;
              else if (Array.isArray(v) || ArrayBuffer.isView(v)) summary[k] = `[${v.length} items]`;
            }
            console.log(`  ${a.publicKey.toBase58()}: ${JSON.stringify(summary)}`);
          }
        }
      } catch (e) { console.log(`${accType}: error - ${e.message}`); }
    }
  }

  // 4. Check SapPostgres SDK data
  console.log('\n=== SDK DB DATA ===');
  const { Pool } = require('pg');
  const { SapPostgres } = require('@oobe-protocol-labs/synapse-sap-sdk');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const sapPg = new SapPostgres(pool, sap, false);

  // Check sap_events for this vault
  const { rows: events } = await pool.query(
    "SELECT event_name, tx_signature, slot, data FROM sap_events WHERE data::text LIKE '%2wfPyWiVbWTTo1ua7zhEpaYj97R1K1tq4QJ4hMcGmrV4%' OR data::text LIKE '%CnKdEFLZu5PfjasRv1zJCpYmkm5U12kCQi4tX5cdsuHJ%' ORDER BY id DESC LIMIT 20"
  );
  console.log(`\nEvents mentioning vault/agent: ${events.length}`);
  for (const e of events) {
    console.log(`  ${e.event_name} | slot ${e.slot} | tx ${e.tx_signature.slice(0, 12)}...`);
  }

  await pool.end();
})().catch(e => console.error('ERROR:', e.message));
