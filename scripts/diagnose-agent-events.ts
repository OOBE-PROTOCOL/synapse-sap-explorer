/**
 * Scan recent signatures of the AGENT PDA (or wallet) and parse all SAP events.
 * Goal: confirm whether ToolSchemaInscribedEvent is actually emitted, and on which tool PDA.
 *
 * Run: pnpm tsx scripts/diagnose-agent-events.ts <agentWallet> [limit]
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
  const arg = process.argv[2];
  const limit = Number(process.argv[3] ?? 200);
  if (!arg) { console.error('Usage: tsx scripts/diagnose-agent-events.ts <wallet|sig:SIGNATURE> [limit]'); process.exit(1); }

  const ep = resolveEndpoint(
    (process.env.SYNAPSE_NETWORK ?? 'mainnet') as any,
    (process.env.SYNAPSE_REGION ?? 'US') as any,
  );
  const headers = process.env.SYNAPSE_API_KEY ? { 'x-api-key': process.env.SYNAPSE_API_KEY } : {};
  const conn = new Connection(ep.rpc, { commitment: 'confirmed', httpHeaders: headers });
  const provider = new AnchorProvider(conn, makeReadOnlyWallet(), { commitment: 'confirmed' });
  const sap = SapClient.from(provider, SAP_PROGRAM_ID);
  const eventParser = sap.events;
  console.log('[diag] RPC:', ep.rpc);

  // ── Single-signature mode ───────────────────────
  if (arg.startsWith('sig:')) {
    const sig = arg.slice(4);
    console.log('[diag] Inspecting sig:', sig);
    const tx = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
    if (!tx) { console.error('tx not found'); return; }
    console.log('[diag] logs:');
    (tx.meta?.logMessages ?? []).forEach((l, i) => console.log(`  [${i}] ${l}`));
    const events = eventParser.parseLogs(tx.meta?.logMessages ?? []);
    console.log(`[diag] parsed ${events.length} events:`);
    for (const ev of events) {
      console.log(`  - ${ev.name}`);
      const d: any = ev.data;
      for (const k of Object.keys(d)) {
        const v = d[k];
        const repr = v?.toBase58 ? v.toBase58() : Buffer.isBuffer(v) ? `<bytes ${v.length}>` : Array.isArray(v) ? `[${v.length}]` : String(v);
        console.log(`      ${k}: ${repr}`);
      }
    }
    return;
  }

  // ── Wallet scan mode ────────────────────────────
  const walletPk = new PublicKey(arg);
  const [agentPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('sap_agent'), walletPk.toBuffer()],
    SAP_PROGRAM_ID,
  );
  console.log('[diag] Wallet:', arg);
  console.log('[diag] Agent PDA:', agentPda.toBase58());
  console.log('[diag] Limit:', limit);

  const sigs = await conn.getSignaturesForAddress(walletPk, { limit });
  console.log(`[diag] Got ${sigs.length} sigs for wallet — fetching in parallel batches of 10...`);

  const eventCounts: Record<string, number> = {};
  const inscriptions: Array<{ sig: string; tool: string; toolName?: string; type?: number; bytes?: number }> = [];
  let txWithSapLogs = 0;
  let processed = 0;

  const BATCH = 10;
  for (let i = 0; i < sigs.length; i += BATCH) {
    const batch = sigs.slice(i, i + BATCH);
    const txs = await Promise.all(batch.map((s) =>
      conn.getTransaction(s.signature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' })
        .catch((e) => { console.warn(`  fetch err ${s.signature.slice(0,8)}: ${(e as Error).message}`); return null; })
    ));
    for (let j = 0; j < txs.length; j++) {
      processed++;
      const tx = txs[j];
      if (!tx?.meta?.logMessages) continue;
      const logs = tx.meta.logMessages;
      if (!logs.some((l) => l.includes(SAP_PROGRAM_ID.toBase58()))) continue;
      txWithSapLogs++;
      let events: any[] = [];
      try { events = eventParser.parseLogs(logs); }
      catch (e) { console.warn(`  parseLogs threw on ${batch[j].signature.slice(0,12)}…: ${(e as Error).message}`); continue; }
      for (const ev of events) {
        eventCounts[ev.name] = (eventCounts[ev.name] ?? 0) + 1;
        if (ev.name === 'ToolSchemaInscribedEvent') {
          const d: any = ev.data;
          const tool = d.tool?.toBase58?.() ?? String(d.tool ?? '');
          const sd = d.schemaData ?? d.schema_data;
          const len = Buffer.isBuffer(sd) ? sd.length : (sd?.length ?? 0);
          inscriptions.push({
            sig: batch[j].signature, tool,
            toolName: d.toolName ?? d.tool_name,
            type: Number(d.schemaType ?? d.schema_type ?? 0),
            bytes: len,
          });
        }
      }
    }
    process.stdout.write(`\r  progress ${processed}/${sigs.length} | sapTx=${txWithSapLogs} | inscr=${inscriptions.length}`);
  }
  process.stdout.write('\n');

  console.log(`\n[diag] ${txWithSapLogs}/${sigs.length} txs invoked SAP program`);
  console.log('[diag] Event counts:');
  for (const [name, n] of Object.entries(eventCounts).sort((a,b)=>b[1]-a[1])) {
    console.log(`  ${name}: ${n}`);
  }
  console.log(`\n[diag] Inscriptions found: ${inscriptions.length}`);
  for (const ins of inscriptions) {
    console.log(`  sig=${ins.sig.slice(0,16)}… tool=${ins.tool} name=${ins.toolName ?? '?'} type=${ins.type} bytes=${ins.bytes}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
