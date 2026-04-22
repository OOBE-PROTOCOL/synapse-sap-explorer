const mint = 'HeLp6elS9sE627SpD6H8onN7Qc7vHeXz1yvW87UUpump';
fetch('https://api.mainnet-beta.solana.com', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'getAccountInfo',
    params: [mint, { "encoding": "base64" }]
  })
}).then(r => r.json()).then(d => {
  console.log('Account Info:', JSON.stringify(d, null, 2));
}).catch(e => console.error(e));
