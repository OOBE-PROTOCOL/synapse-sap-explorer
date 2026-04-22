const { PublicKey } = require('@solana/web3.js');
const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const mint = new PublicKey('Ckit5s1Cpc3RDVJpceRKBjuMQDuNqm3NJ9AvCJfBpump');
const [pda] = PublicKey.findProgramAddressSync(
  [Buffer.from('metadata'), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
  TOKEN_METADATA_PROGRAM_ID
);
console.log('Metadata PDA:', pda.toBase58());

fetch('https://api.mainnet-beta.solana.com', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'getAccountInfo',
    params: [pda.toBase58(), { encoding: 'base64' }]
  })
}).then(r => r.json()).then(d => {
  if (!d?.result?.value) { console.log('No Metaplex metadata'); return; }
  const buf = Buffer.from(d.result.value.data[0], 'base64');
  let off = 1 + 32 + 32;
  const nLen = buf.readUInt32LE(off); off += 4;
  const name = buf.subarray(off, off + nLen).toString('utf8').replace(/\0/g, '').trim();
  off += nLen;
  const sLen = buf.readUInt32LE(off); off += 4;
  const symbol = buf.subarray(off, off + sLen).toString('utf8').replace(/\0/g, '').trim();
  off += sLen;
  const uLen = buf.readUInt32LE(off); off += 4;
  const uri = buf.subarray(off, off + uLen).toString('utf8').replace(/\0/g, '').trim();
  console.log('Name:', name);
  console.log('Symbol:', symbol);
  console.log('URI:', uri);
}).catch(e => console.error(e));
