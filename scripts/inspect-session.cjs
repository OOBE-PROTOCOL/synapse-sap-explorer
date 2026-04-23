const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { AnchorProvider } = require('@coral-xyz/anchor');
const { SapClient, SAP_PROGRAM_ID, deriveSession, deriveVault, SessionManager, VaultModule, LedgerModule } = require('@oobe-protocol-labs/synapse-sap-sdk');
const { resolveEndpoint } = require('@oobe-protocol-labs/synapse-client-sdk');

const ep = resolveEndpoint('mainnet', 'US');
const conn = new Connection(ep.rpc, {
  commitment: 'confirmed',
  httpHeaders: { 'x-api-key': process.env.SYNAPSE_API_KEY },
});
const kp = Keypair.generate();
const wallet = { publicKey: kp.publicKey, signTransaction: async (t) => t, signAllTransactions: async (t) => t, payer: kp };
const provider = new AnchorProvider(conn, wallet, { commitment: 'confirmed' });
const sap = SapClient.from(provider, SAP_PROGRAM_ID);

// Patch provider.wallet for SessionManager
if (!provider.wallet) provider.wallet = wallet;
if (sap.program && sap.program.provider && !sap.program.provider.wallet) {
  sap.program.provider.wallet = wallet;
}

const agentPda = new PublicKey('CnKdEFLZu5PfjasRv1zJCpYmkm5U12kCQi4tX5cdsuHJ');
const vaultPda = new PublicKey('2wfPyWiVbWTTo1ua7zhEpaYj97R1K1tq4QJ4hMcGmrV4');
const sessionPda = new PublicKey('Ax5eHGi7F2zH3669zuR8eAAB7WvaioVRqKskNBdjLpJE');

(async () => {
  // 1. VaultModule
  console.log('=== VaultModule ===');
  const vm = new VaultModule(sap);
  console.log('VaultModule methods:', Object.getOwnPropertyNames(VaultModule.prototype));

  try {
    const vault = await vm.fetchVault(agentPda);
    console.log('fetchVault result:', JSON.stringify(vault, (k, v) => {
      if (v instanceof PublicKey) return v.toBase58();
      if (Buffer.isBuffer(v) || (v && v.type === 'Buffer')) return `[Buffer]`;
      if (Array.isArray(v) && v.length > 10) return `[${v.length} items]`;
      return v;
    }, 2));
  } catch (e) { console.log('fetchVault error:', e.message); }

  // 2. Try fetchSession with vault PDA + sessionHash
  console.log('\n=== fetchSession ===');
  try {
    // The sessionHash from the sessionLedger account
    const sessionAccount = await sap.program.account.sessionLedger.fetch(sessionPda);
    const sessionHash = Buffer.from(sessionAccount.sessionHash);
    console.log('sessionHash hex:', sessionHash.toString('hex'));
    console.log('sessionAccount:', JSON.stringify(sessionAccount, (k, v) => {
      if (v instanceof PublicKey) return v.toBase58();
      if (Buffer.isBuffer(v) || (v && v.type === 'Buffer')) return `[Buffer ${v.length || Buffer.from(v.data || []).length}B]`;
      if (Array.isArray(v) && v.length > 10) return `[${v.length} items]`;
      return v;
    }, 2));
  } catch (e) { console.log('fetchSession error:', e.message); }

  // 3. SessionManager
  console.log('\n=== SessionManager ===');
  console.log('SessionManager methods:', Object.getOwnPropertyNames(SessionManager.prototype));
  console.log('SessionManager static:', Object.getOwnPropertyNames(SessionManager));

  // Try deriveContext with various session IDs
  const sm = new SessionManager(sap);
  
  // Try to derive context for the known session
  // We need to figure out the sessionId string that hashes to the sessionHash
  // Let's try common ones
  const candidates = ['default', 'main', 'session-0', 'session-1', 'memory', 'chat', 'openclaw', 'test'];
  const crypto = require('crypto');
  
  for (const id of candidates) {
    const hash = crypto.createHash('sha256').update(id).digest('hex');
    console.log(`  "${id}" → ${hash}`);
  }

  // Let's see if deriveContext takes agentPda or vaultPda
  console.log('\n=== deriveContext signature ===');
  try {
    // Try with sessionId "default"
    const ctx = sm.deriveContext(agentPda, 'default');
    console.log('deriveContext("default"):', JSON.stringify(ctx, (k, v) => {
      if (v instanceof PublicKey) return v.toBase58();
      return v;
    }, 2));
  } catch (e) {
    console.log('deriveContext error:', e.message);
    // Try other signatures
    try {
      const ctx = sm.deriveContext('default');
      console.log('deriveContext(string):', ctx);
    } catch (e2) {
      console.log('deriveContext(string) error:', e2.message);
    }
  }

  // 4. LedgerModule
  console.log('\n=== LedgerModule ===');
  console.log('LedgerModule methods:', Object.getOwnPropertyNames(LedgerModule.prototype));
  const lm = new LedgerModule(sap);
  
  // Try to fetch ledger for the session
  try {
    const ledger = await lm.fetchLedger(sessionPda);
    console.log('fetchLedger:', JSON.stringify(ledger, (k, v) => {
      if (v instanceof PublicKey) return v.toBase58();
      if (Buffer.isBuffer(v)) return `[Buffer ${v.length}B]`;
      if (Array.isArray(v) && v.length > 10) return `[${v.length} items]`;
      return v;
    }, 2));
  } catch (e) { console.log('fetchLedger error:', e.message); }

  try {
    const ledger = await lm.fetchLedgerNullable(sessionPda);
    console.log('fetchLedgerNullable:', ledger);
  } catch (e) { console.log('fetchLedgerNullable error:', e.message); }

  // 5. Check the raw account data of the session to find the ring buffer
  console.log('\n=== Raw Session Account Data ===');
  const accInfo = await conn.getAccountInfo(sessionPda);
  if (accInfo) {
    console.log('Account size:', accInfo.data.length, 'bytes');
    console.log('Owner:', accInfo.owner.toBase58());
    // The ring buffer might be appended after the fixed fields
    // Let's dump the hex
    console.log('First 200 bytes hex:', accInfo.data.slice(0, 200).toString('hex'));
    console.log('Last 100 bytes hex:', accInfo.data.slice(-100).toString('hex'));
  }

  // 6. Try to get status using SessionManager
  console.log('\n=== SessionManager.getStatus ===');
  try {
    // Look at how deriveContext works
    const src = sm.deriveContext.toString();
    console.log('deriveContext source:', src.slice(0, 500));
  } catch (e) { console.log('source error:', e.message); }

  // Try readAll with raw context
  console.log('\n=== Try readAll ===');
  try {
    const ctx = { vault: vaultPda, session: sessionPda };
    const data = await sm.readAll(ctx);
    console.log('readAll:', JSON.stringify(data, (k, v) => {
      if (v instanceof PublicKey) return v.toBase58();
      if (Buffer.isBuffer(v)) return `[Buffer ${v.length}B]`;
      return v;
    }, 2));
  } catch (e) { console.log('readAll error:', e.message); }

  try {
    const status = await sm.getStatus({ vault: vaultPda, session: sessionPda });
    console.log('getStatus:', JSON.stringify(status, null, 2));
  } catch (e) { console.log('getStatus error:', e.message); }

  process.exit(0);
})();
