// Test Anchor BorshInstructionCoder with the SAP IDL
const { BorshInstructionCoder } = require('@coral-xyz/anchor');
const { SAP_IDL } = require('@oobe-protocol-labs/synapse-sap-sdk/idl');

// Base58 decoder (no external dep)
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

console.log('BorshInstructionCoder available:', typeof BorshInstructionCoder);
const coder = new BorshInstructionCoder(SAP_IDL);
console.log('coder created:', !!coder);
console.log('coder.decode is function:', typeof coder.decode);

// Now fetch a real transaction and try to decode its instruction data
const SAP_ADDR = 'SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ';

async function main() {
  // Load env
  const fs = require('fs');
  const envText = fs.readFileSync('.env', 'utf8');
  const envVars = {};
  for (const line of envText.split('\n')) {
    if (line.startsWith('#') || !line.includes('=')) continue;
    const [k, ...rest] = line.split('=');
    envVars[k.trim()] = rest.join('=').trim().replace(/^["']|["']$/g, '');
  }
  
  const rpcUrl = 'https://us-1-mainnet.oobeprotocol.ai';
  const apiKey = envVars.SYNAPSE_API_KEY || process.env.SYNAPSE_API_KEY || '';
  console.log('API key present:', apiKey.length > 0, '(len:', apiKey.length, ')');

  const sig = '3oxSDSkTZYofKtmqUqZC27uQdFpCg67g5gUUHGLDHq9CbWmgqo2GqGSkCnThkbKG1RvKGtQDkSppbHtYAmqDhuKo';
  
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      ...(apiKey ? { 'x-api-key': apiKey } : {})
    },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'getTransaction',
      params: [sig, { encoding: 'json', maxSupportedTransactionVersion: 0 }]
    })
  });
  
  const d = await res.json();
  
  if (d.error) {
    console.log('RPC error:', d.error);
    return;
  }
  
  if (!d.result) {
    console.log('No result - tx might not exist or auth failed');
    console.log('Response:', JSON.stringify(d).substring(0, 500));
    return;
  }
  
  const msg = d.result.transaction.message;
  const accountKeys = msg.accountKeys || [];
  const ixs = msg.instructions || [];
  
  console.log('\n=== accountKeys (first 5) ===');
  console.log(accountKeys.slice(0, 5));
  
  console.log('\n=== All instructions ===');
  for (let i = 0; i < ixs.length; i++) {
    const ix = ixs[i];
    const pid = ix.programId || (ix.programIdIndex != null ? accountKeys[ix.programIdIndex] : '?');
    console.log(`ix[${i}] programId: ${pid}`);
    console.log(`  data: "${ix.data}" (len=${ix.data?.length})`);
    
    if (pid === SAP_ADDR && ix.data) {
      console.log('  --> This is a SAP instruction, trying to decode...');
      
      // Try base58 decode
      try {
        const buf = decodeBase58(ix.data);
        
        console.log('  base58 decoded bytes (first 16):', Array.from(buf.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' '));
        console.log('  discriminator hex:', Array.from(buf.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(''));
        
        // Try Anchor coder decode
        const decoded = coder.decode(buf);
        if (decoded) {
          console.log('  *** DECODED instruction name:', decoded.name);
          console.log('  *** DECODED data keys:', Object.keys(decoded.data || {}));
        } else {
          console.log('  coder.decode returned null');
        }
      } catch(e) {
        console.log('  decode error:', e.message);
      }
    }
  }
  
  // Also check inner instructions
  const innerIxs = d.result.meta?.innerInstructions || [];
  console.log('\n=== Inner instructions ===');
  for (const group of innerIxs) {
    for (const ix of group.instructions || []) {
      const pid = ix.programId || (ix.programIdIndex != null ? accountKeys[ix.programIdIndex] : '?');
      if (pid === SAP_ADDR) {
        console.log(`inner ix programId: ${pid}, data: "${ix.data}" (len=${ix.data?.length})`);
      }
    }
  }
  
  console.log('\n=== Log messages ===');
  const logs = d.result.meta?.logMessages || [];
  logs.forEach((l, i) => console.log(`  [${i}] ${l}`));
}

main().catch(e => console.error('Fatal:', e));
