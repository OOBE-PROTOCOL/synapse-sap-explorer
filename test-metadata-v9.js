const data = {
  jsonrpc: '2.0',
  id: 1,
  method: 'getHealth',
  params: []
};
fetch('https://api.mainnet-beta.solana.com', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
}).then(r => r.json()).then(d => {
  console.log('Response:', JSON.stringify(d, null, 2));
}).catch(e => console.error(e));
