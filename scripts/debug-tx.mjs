const sig = '3oxSDSkTZYofKtmqUqZC27uQdFpCg67g5gUUHGLDHq9CbWmgqo2GqGSkCnThkbKG1RvKGtQDkSppbHtYAmqDhuKo';
const rpcUrl = 'https://us-1-mainnet.oobeprotocol.ai';
const apiKey = process.env.SYNAPSE_API_KEY || '';

const res = await fetch(rpcUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(apiKey ? { 'x-api-key': apiKey } : {}) },
  body: JSON.stringify({
    jsonrpc: '2.0', id: 1,
    method: 'getTransaction',
    params: [sig, { encoding: 'json', maxSupportedTransactionVersion: 0 }]
  })
});
const d = await res.json();
const msg = d.result?.transaction?.message;

console.log('=== instructions ===');
(msg?.instructions || []).forEach((ix, i) => {
  console.log(`ix[${i}] programId: ${ix.programId}`);
  console.log(`  data: "${ix.data}" (len=${ix.data?.length})`);
  console.log(`  programIdIndex: ${ix.programIdIndex}`);
  console.log(`  accounts: ${JSON.stringify(ix.accounts)}`);
});

console.log('\n=== inner instructions ===');
(d.result?.meta?.innerInstructions || []).forEach((g) => {
  console.log(`group index=${g.index}`);
  (g.instructions || []).forEach((ix, j) => {
    console.log(`  inner[${j}] programId: ${ix.programId} data: "${ix.data?.substring(0,40)}..." (len=${ix.data?.length})`);
  });
});

console.log('\n=== accountKeys[0..5] ===');
console.log((msg?.accountKeys || []).slice(0, 5));

// Test base58 decode of the first SAP ix data
const sapAddr = 'SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ';
const sapIx = (msg?.instructions || []).find(ix => ix.programId === sapAddr);
if (sapIx && sapIx.data) {
  console.log('\n=== SAP instruction data (raw) ===');
  console.log(sapIx.data);
  console.log('Is likely base58 (no +/= chars):', !/[+/=]/.test(sapIx.data));

  // Try base64 decode
  try {
    const b64 = atob(sapIx.data);
    const bytes64 = Array.from(b64, c => c.charCodeAt(0));
    console.log('base64 decode first 8 bytes hex:', bytes64.slice(0,8).map(b => b.toString(16).padStart(2,'0')).join(''));
  } catch(e) {
    console.log('base64 decode failed:', e.message);
  }

  // Base58 decode
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  function decodeBase58(str) {
    const bytes = [];
    for (const c of str) {
      const idx = ALPHABET.indexOf(c);
      if (idx < 0) throw new Error(`Invalid base58 char: ${c}`);
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
    for (const c of str) {
      if (c !== '1') break;
      bytes.unshift(0);
    }
    return new Uint8Array(bytes);
  }

  try {
    const b58bytes = decodeBase58(sapIx.data);
    console.log('base58 decode first 8 bytes hex:', Array.from(b58bytes.slice(0,8)).map(b => b.toString(16).padStart(2,'0')).join(''));
  } catch(e) {
    console.log('base58 decode failed:', e.message);
  }
}
