fetch('https://api.mainnet-beta.solana.com', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'getAccountInfo',
    params: ['Ckit5s1Cpc3RDVJpceRKBjuMQDuNqm3NJ9AvCJfBpump', { encoding: 'jsonParsed' }]
  })
}).then(r => r.json()).then(d => {
  console.log('Account Info:', JSON.stringify(d, null, 2));
}).catch(e => console.error(e));
