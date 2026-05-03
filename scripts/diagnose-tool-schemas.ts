/**
 * Diagnostic — verify that the SDK + EventParser correctly decodes
 * `ToolSchemaInscribedEvent` for an agent's inscribed tool schemas.
 *
 * Run: pnpm tsx scripts/diagnose-tool-schemas.ts <agentWallet>
 */
import 'dotenv/config';
import { Connection, PublicKey } from '@solana/web3.js';
import { AnchorProvider } from '@coral-xyz/anchor';
import { SapClient } from '@oobe-protocol-labs/synapse-sap-sdk';
import { resolveEndpoint } from '@oobe-protocol-labs/synapse-client-sdk';

const SAP_PROGRAM_ID = new PublicKey('SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ');

function makeReadOnlyWallet() {
  return {
    publicKey: PublicKey.default,
    signTransaction: async (tx: unknown) => tx,
    signAllTransactions: async (txs: unknown[]) => txs,
  } as unknown as AnchorProvider['wallet'];
}

async function main() {
  const wallet = process.argv[2];
  if (!wallet) {
    console.error('Usage: tsx scripts/diagnose-tool-schemas.ts <agentWallet>');
    process.exit(1);
  }

  const network = (process.env.SYNAPSE_NETWORK ?? 'mainnet') as 'mainnet';
  const region = (process.env.SYNAPSE_REGION ?? 'US') as 'US';
  const apiKey = process.env.SYNAPSE_API_KEY;
  let rpcUrl: string;
  let httpHeaders: Record<string,string> = {};
  try {
    const ep = resolveEndpoint(network as any, region as any);
    rpcUrl = ep.rpc;
    if (apiKey) httpHeaders = { 'x-api-key': apiKey };
  } catch (e) {
    console.warn('[diag] resolveEndpoint failed:', (e as Error).message);
    rpcUrl = process.env.SAP_FALLBACK_RPC_URL || 'https://api.mainnet-beta.solana.com';
  }
  console.log('[diag] RPC:', rpcUrl);
  console.log('[diag] Wallet:', wallet);

  const conn = new Connection(rpcUrl, { commitment: 'confirmed', httpHeaders });
  const provider = new AnchorProvider(conn, makeReadOnlyWallet(), { commitment: 'confirmed' });
  const sap = SapClient.from(provider, SAP_PROGRAM_ID);

  // Derive agent PDA
  const [agentPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('sap_agent'), new PublicKey(wallet).toBuffer()],
    SAP_PROGRAM_ID,
  );
  console.log('[diag] Agent PDA:', agentPda.toBase58());

  // Fetch all tools for this agent
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const program: any = (sap as any).program;
  const allTools = await program.account.toolDescriptor.all([
    { memcmp: { offset: 8 + 1, bytes: agentPda.toBase58() } }, // bump(1) then agent(32)
  ]);
  console.log(`[diag] Found ${allTools.length} tools for this agent`);

  const eventParser = sap.events;

  for (const t of allTools) {
    const toolPda = t.publicKey.toBase58();
    const toolName = String(t.account.toolName ?? '');
    const hasInput = Array.isArray(t.account.inputSchemaHash) && t.account.inputSchemaHash.some((b: number) => b !== 0);
    const hasOutput = Array.isArray(t.account.outputSchemaHash) && t.account.outputSchemaHash.some((b: number) => b !== 0);
    const hasDesc = Array.isArray(t.account.descriptionHash) && t.account.descriptionHash.some((b: number) => b !== 0);

    console.log('\n────────────────────────────');
    console.log(`Tool: ${toolName}`);
    console.log(`  PDA: ${toolPda}`);
    console.log(`  Hashes: input=${hasInput} output=${hasOutput} desc=${hasDesc}`);

    if (!hasInput && !hasOutput && !hasDesc) {
      console.log('  → No schema declared on-chain (skip scan)');
      continue;
    }

    // Scan most recent 200 sigs for this tool PDA
    const sigs = await conn.getSignaturesForAddress(t.publicKey, { limit: 200 });
    console.log(`  Scanned ${sigs.length} signatures`);

    let foundCount = 0;
    for (const s of sigs) {
      const tx = await conn.getTransaction(s.signature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed',
      });
      if (!tx?.meta?.logMessages) continue;
      const events = eventParser.parseLogs(tx.meta.logMessages);
      const inscriptions = events.filter((e) => e.name === 'ToolSchemaInscribedEvent');
      for (const ev of inscriptions) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d = ev.data as any;
        const evTool = d.tool?.toBase58?.() ?? String(d.tool ?? '');
        const evType = Number(d.schemaType ?? d.schema_type ?? 0);
        const evComp = Number(d.compression ?? 0);
        const sd = d.schemaData ?? d.schema_data;
        const len = Buffer.isBuffer(sd) ? sd.length : (sd?.length ?? 0);
        console.log(`    ✓ event sig=${s.signature.slice(0,12)}… tool=${evTool.slice(0,12)}… type=${evType} comp=${evComp} bytes=${len}`);
        foundCount++;
      }
    }
    console.log(`  → ${foundCount} inscriptions decoded`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
