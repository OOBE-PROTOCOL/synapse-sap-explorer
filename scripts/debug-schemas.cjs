const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { AnchorProvider } = require('@coral-xyz/anchor');
const { SapClient, SAP_PROGRAM_ID } = require('@oobe-protocol-labs/synapse-sap-sdk');
const { resolveEndpoint, SynapseNetwork, SynapseRegion } = require('@oobe-protocol-labs/synapse-client-sdk');
require('dotenv').config();

async function main() {
  const network = (process.env.SYNAPSE_NETWORK || 'devnet') === 'mainnet' ? SynapseNetwork.Mainnet : SynapseNetwork.Devnet;
  const region = (process.env.SYNAPSE_REGION || 'US') === 'EU' ? SynapseRegion.EU : SynapseRegion.US;
  const ep = resolveEndpoint(network, region);
  console.log('RPC:', ep.rpc);

  const conn = new Connection(ep.rpc, {
    commitment: 'confirmed',
    httpHeaders: { 'x-api-key': process.env.SYNAPSE_API_KEY || '' },
  });

  const wallet = {
    publicKey: Keypair.generate().publicKey,
    signTransaction: async (tx) => tx,
    signAllTransactions: async (txs) => txs,
  };
  const provider = new AnchorProvider(conn, wallet, { commitment: 'confirmed' });
  const sap = SapClient.from(provider, SAP_PROGRAM_ID);

  const allTools = await sap.program.account.toolDescriptor.all();
  console.log('Total tools:', allTools.length);

  let toolsWithSchemas = 0;

  for (const t of allTools) {
    const d = t.account;
    const inputH = d.inputSchemaHash || [];
    const outputH = d.outputSchemaHash || [];
    const descH = d.descriptionHash || [];
    const hasInput = inputH.some(b => b !== 0);
    const hasOutput = outputH.some(b => b !== 0);
    const hasDesc = descH.some(b => b !== 0);

    if (hasInput || hasOutput || hasDesc) {
      toolsWithSchemas++;
      console.log('\n=== Tool with schemas:', t.publicKey.toBase58());
      console.log('  Name:', d.toolName);
      console.log('  Hashes: input=' + hasInput, 'output=' + hasOutput, 'desc=' + hasDesc);

      const sigs = await conn.getSignaturesForAddress(t.publicKey, { limit: 20 });
      console.log('  TX count:', sigs.length);

      for (let i = 0; i < Math.min(5, sigs.length); i++) {
        const tx = await conn.getTransaction(sigs[i].signature, { maxSupportedTransactionVersion: 0 });
        const logs = tx?.meta?.logMessages || [];
        const dataLines = logs.filter(l => l.startsWith('Program data:'));
        console.log('  TX', i, ':', sigs[i].signature.slice(0, 24) + '...', 'logs=' + logs.length, 'data_lines=' + dataLines.length);
      }
    }
  }

  console.log('\nTools with non-zero schema hashes:', toolsWithSchemas, '/', allTools.length);
}

main().catch(e => console.error('Error:', e.message));
