const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { AnchorProvider } = require('@coral-xyz/anchor');
const { SapClient, SAP_PROGRAM_ID } = require('@oobe-protocol-labs/synapse-sap-sdk');
const { resolveEndpoint, SynapseNetwork, SynapseRegion } = require('@oobe-protocol-labs/synapse-client-sdk');

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
  // Fetch vault account
  const vault = await sap.program.account.memoryVault.fetch(vaultPda);
  console.log('=== VAULT ===');
  console.log(JSON.stringify({
    agent: vault.agent?.toBase58?.(),
    wallet: vault.wallet?.toBase58?.(),
    totalSessions: vault.totalSessions,
    totalInscriptions: vault.totalInscriptions?.toString(),
    totalBytesInscribed: vault.totalBytesInscribed?.toString(),
    createdAt: vault.createdAt?.toString(),
    nonceVersion: vault.nonceVersion,
    protocolVersion: vault.protocolVersion,
  }, null, 2));

  // List all sessionLedger accounts for this vault (memcmp: vault at offset 8)
  console.log('\n=== SESSIONS ===');
  const sessions = await sap.program.account.sessionLedger.all([
    { memcmp: { offset: 8, bytes: vaultPda.toBase58() } }
  ]);
  console.log(sessions.length, 'sessions found');
  for (const s of sessions) {
    const d = s.account;
    console.log(JSON.stringify({
      pda: s.publicKey.toBase58(),
      sessionHash: Buffer.from(d.sessionHash).toString('hex'),
      isClosed: d.isClosed,
      totalEntries: d.totalEntries,
      totalDataSize: d.totalDataSize?.toString(),
      numEpochPages: d.numEpochPages,
    }));
  }

  // List all memoryLedger accounts
  console.log('\n=== ALL LEDGERS ===');
  const ledgers = await sap.program.account.memoryLedger.all();
  console.log(ledgers.length, 'ledgers total');
  for (const l of ledgers) {
    const d = l.account;
    console.log(JSON.stringify({
      pda: l.publicKey.toBase58(),
      session: d.session?.toBase58?.(),
      numEntries: d.numEntries,
      totalDataSize: d.totalDataSize?.toString(),
      numPages: d.numPages,
      isSealed: d.isSealed,
      ringLen: d.ring?.length,
    }));
  }

  // Try to read ledger pages
  console.log('\n=== LEDGER PAGES ===');
  const pages = await sap.program.account.ledgerPage.all();
  console.log(pages.length, 'pages total');
  for (const p of pages) {
    const d = p.account;
    console.log(JSON.stringify({
      pda: p.publicKey.toBase58(),
      ledger: d.ledger?.toBase58?.(),
      pageIndex: d.pageIndex,
      dataLen: d.data?.length,
    }));
  }

  // Epoch pages
  console.log('\n=== EPOCH PAGES ===');
  try {
    const epochPages = await sap.program.account.epochPage.all();
    console.log(epochPages.length, 'epoch pages total');
    for (const ep of epochPages) {
      const d = ep.account;
      console.log(JSON.stringify({
        pda: ep.publicKey.toBase58(),
        session: d.session?.toBase58?.(),
        epochIndex: d.epochIndex,
        numEntries: d.numEntries,
        dataLen: d.data?.length,
      }));
    }
  } catch (e) {
    console.log('epoch pages error:', e.message);
  }
})().catch(e => console.error('ERROR:', e.message));
