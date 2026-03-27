const { BorshInstructionCoder } = require('@coral-xyz/anchor');
const { SAP_IDL } = require('@oobe-protocol-labs/synapse-sap-sdk/idl');
const fs = require('fs');

// Load env
const envText = fs.readFileSync('/Users/keepeeto/Desktop/synapse-template-sdk/.env', 'utf8');
const envVars = {};
for (const line of envText.split('\n')) {
  if (line.startsWith('#') || !line.includes('=')) continue;
  const [k, ...rest] = line.split('=');
  envVars[k.trim()] = rest.join('=').trim().replace(/^["']|["']$/g, '');
}

const rpcUrl = 'https://us-1-mainnet.oobeprotocol.ai';
const apiKey = envVars.SYNAPSE_API_KEY || '';
const SAP_ADDR = 'SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ';
const headers = { 'Content-Type': 'application/json', ...(apiKey ? { 'x-api-key': apiKey } : {}) };

// Base58 decoder
const BS58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function decodeBase58(str) {
  const bytes = [];
  for (const c of str) {
    const idx = BS58_ALPHABET.indexOf(c);
    if (idx < 0) throw new Error('Invalid base58 char: ' + c);
    let carry = idx;
    for (let j = bytes.length - 1; j >= 0; j--) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.unshift(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const c of str) { if (c !== '1') break; bytes.unshift(0); }
  return Buffer.from(bytes);
}

const coder = new BorshInstructionCoder(SAP_IDL);
console.log('Coder ready, IDL has', SAP_IDL.instructions.length, 'instructions');

async function rpc(method, params) {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  const d = await res.json();
  if (d.error) throw new Error(JSON.stringify(d.error));
  return d.result;
}

async function main() {
  // 1. Get recent signatures
  console.log('\n--- Fetching recent SAP signatures ---');
  const sigs = await rpc('getSignaturesForAddress', [SAP_ADDR, { limit: 5 }]);
  console.log('Got', sigs.length, 'signatures');
  
  for (const sigInfo of sigs) {
    const sig = sigInfo.signature;
    console.log('\n========================================');
    console.log('TX:', sig.slice(0, 20) + '...');
    
    // 2. Fetch with encoding: 'json' (this is what our route does)
    const raw = await rpc('getTransaction', [sig, { encoding: 'json', maxSupportedTransactionVersion: 0 }]);
    if (!raw) { console.log('  null result (pruned?)'); continue; }
    
    const msg = raw.transaction.message;
    const accountKeys = msg.accountKeys || [];
    const ixs = msg.instructions || [];
    
    // Find SAP instructions
    for (let i = 0; i < ixs.length; i++) {
      const ix = ixs[i];
      const pid = ix.programId || (ix.programIdIndex != null ? accountKeys[ix.programIdIndex] : null);
      if (pid !== SAP_ADDR) continue;
      
      console.log(`  SAP ix[${i}] data: "${ix.data}" (len=${ix.data?.length})`);
      
      if (ix.data) {
        try {
          // base58 decode
          const buf = decodeBase58(ix.data);
          const discHex = Array.from(buf.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('');
          console.log('  discriminator hex:', discHex, '(from base58)');
          
          // Try atob (what our code was doing - WRONG for base58)
          try {
            const b64bin = atob(ix.data);
            const b64hex = Array.from(b64bin, c => c.charCodeAt(0).toString(16).padStart(2, '0')).slice(0, 8).join('');
            console.log('  atob (wrong) hex:', b64hex, '(from treating as base64 - INCORRECT)');
          } catch(e) {
            console.log('  atob fails:', e.message);
          }
          
          // Try Anchor coder decode
          const decoded = coder.decode(buf);
          if (decoded) {
            console.log('  *** ANCHOR DECODED:', decoded.name);
          } else {
            console.log('  coder.decode returned null');
          }
        } catch(e) {
          console.log('  decode error:', e.message);
        }
      }
    }
    
    // Check inner instructions too
    const innerIxs = raw.meta?.innerInstructions || [];
    for (const group of innerIxs) {
      for (const ix of group.instructions || []) {
        const pid = ix.programId || (ix.programIdIndex != null ? accountKeys[ix.programIdIndex] : null);
        if (pid !== SAP_ADDR) continue;
        console.log(`  SAP inner ix data: "${ix.data}" (len=${ix.data?.length})`);
        if (ix.data) {
          try {
            const buf = decodeBase58(ix.data);
            const decoded = coder.decode(buf);
            console.log('  *** ANCHOR inner DECODED:', decoded?.name || 'null');
          } catch(e) {
            console.log('  inner decode error:', e.message);
          }
        }
      }
    }
    
    // Show some logs for context
    const logs = raw.meta?.logMessages || [];
    const sapLogs = logs.filter(l => l.includes('Instruction:') || l.includes(SAP_ADDR));
    if (sapLogs.length > 0) {
      console.log('  Relevant logs:');
      sapLogs.forEach(l => console.log('    ' + l));
    }
  }
}

main().catch(e => console.error('Fatal:', e));
