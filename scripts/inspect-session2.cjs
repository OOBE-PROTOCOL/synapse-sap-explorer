const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { AnchorProvider } = require('@coral-xyz/anchor');
const { SapClient, SAP_PROGRAM_ID } = require('@oobe-protocol-labs/synapse-sap-sdk');
const { resolveEndpoint } = require('@oobe-protocol-labs/synapse-client-sdk');

const ep = resolveEndpoint('mainnet', 'US');
const conn = new Connection(ep.rpc, {
  commitment: 'confirmed',
  httpHeaders: { 'x-api-key': process.env.SYNAPSE_API_KEY },
});
const kp = Keypair.generate();
const w = { publicKey: kp.publicKey, signTransaction: async t => t, signAllTransactions: async t => t };
const prov = new AnchorProvider(conn, w, { commitment: 'confirmed' });
const sap = SapClient.from(prov, SAP_PROGRAM_ID);

const agentPda = new PublicKey('CnKdEFLZu5PfjasRv1zJCpYmkm5U12kCQi4tX5cdsuHJ');
const vaultPda = new PublicKey('2wfPyWiVbWTTo1ua7zhEpaYj97R1K1tq4QJ4hMcGmrV4');
const sessionPda = new PublicKey('Ax5eHGi7F2zH3669zuR8eAAB7WvaioVRqKskNBdjLpJE');

(async () => {
  const sm = sap.session;  // use the getter!
  console.log('SessionManager OK');

  // 1. deriveContext - needs the wallet that created the vault, not ours
  //    Let's try with the vault owner wallet
  const ownerWallet = new PublicKey('2hsRLHTzm5fn2TFb6Z2nY2uEehFMXECkPmGpowoLNkrT');
  console.log('\n=== deriveContext source ===');
  console.log(sm.deriveContext.toString().slice(0, 600));

  // 2. fetchSessionByPda
  console.log('\n=== fetchSessionByPda ===');
  try {
    const session = await sap.vault.fetchSessionByPda(sessionPda);
    console.log('session:', JSON.stringify(session, (k, v) => {
      if (v instanceof PublicKey) return v.toBase58();
      if (Buffer.isBuffer(v)) return `[Buffer ${v.length}B]`;
      if (Array.isArray(v) && v.length > 10) return `[${v.length} items]`;
      return v;
    }, 2));
  } catch (e) { console.log('error:', e.message); }

  // 3. Try to read any memory data from the session
  console.log('\n=== getStatus with manual context ===');
  try {
    const status = await sm.getStatus({ vault: vaultPda, session: sessionPda });
    console.log('status:', JSON.stringify(status, null, 2));
  } catch (e) { 
    console.log('getStatus error:', e.message);
    console.log(sm.getStatus.toString().slice(0, 800));
  }

  // 4. readAll  
  console.log('\n=== readAll ===');
  try {
    const data = await sm.readAll({ vault: vaultPda, session: sessionPda });
    console.log('readAll:', JSON.stringify(data, (k, v) => {
      if (v instanceof PublicKey) return v.toBase58();
      if (Buffer.isBuffer(v)) return `[Buffer ${v.length}B]`;
      return v;
    }, 2));
  } catch (e) { 
    console.log('readAll error:', e.message);
    console.log(sm.readAll.toString().slice(0, 800));
  }

  // 5. readLatest
  console.log('\n=== readLatest ===');
  try {
    const latest = await sm.readLatest({ vault: vaultPda, session: sessionPda });
    console.log('readLatest:', JSON.stringify(latest, (k,v) => {
      if (Buffer.isBuffer(v)) return v.toString('utf8').slice(0, 200);
      return v;
    }, 2));
  } catch (e) {
    console.log('readLatest error:', e.message);
    console.log(sm.readLatest.toString().slice(0, 600));
  }

  // 6. fetch/fetchNullable (direct session account read)
  console.log('\n=== sm.fetch / fetchNullable ===');
  try {
    const d = await sm.fetchNullable(sessionPda);
    console.log('fetchNullable:', JSON.stringify(d, (k, v) => {
      if (v instanceof PublicKey) return v.toBase58();
      if (Buffer.isBuffer(v)) return `[Buffer ${v.length}B]`;
      if (Array.isArray(v) && v.length > 10) return `[${v.length} items]`;
      return v;
    }, 2));
  } catch (e) { console.log('fetchNullable error:', e.message); }

  // 7. LedgerModule
  console.log('\n=== LedgerModule ===');
  const lm = sap.ledger;
  try {
    const ledger = await lm.fetchLedgerNullable(sessionPda);
    console.log('ledger for session:', ledger);
  } catch (e) { console.log('ledger error:', e.message); }

  // 8. Raw account data of sessionLedger to find ring buffer
  console.log('\n=== Raw Session Account ===');
  const accInfo = await conn.getAccountInfo(sessionPda);
  if (accInfo) {
    console.log('Size:', accInfo.data.length, 'bytes');
    console.log('Hex:', accInfo.data.toString('hex'));
    // Try to decode the ring buffer portion
    // Fixed header: 8 (discriminator) + 1 (bump) + 32 (vault) + 32 (sessionHash) +
    //   8 (sequenceCounter) + 8 (totalBytes) + 4? (currentEpoch) + 4? (totalEpochs) +
    //   8 (createdAt) + 8 (lastInscribedAt) + 1 (isClosed) + 32 (merkleRoot) + 
    //   4? (totalCheckpoints) + 32 (tipHash)
    // The remaining data is the ring buffer
    const data = accInfo.data;
    // After discriminator (8), let's look for the data payload
    // The session has totalBytes=44, sequenceCounter=1
    // Try decoding with SessionManager.decodeRingBuffer
    try {
      const entries = sm.decodeRingBuffer(data);
      console.log('decodeRingBuffer from full data:', entries);
    } catch (e) {
      console.log('decodeRingBuffer error:', e.message);
    }
  }

  process.exit(0);
})();
