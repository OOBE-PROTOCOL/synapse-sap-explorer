const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { AnchorProvider } = require('@coral-xyz/anchor');
const { SapClient, SAP_PROGRAM_ID } = require('@oobe-protocol-labs/synapse-sap-sdk');
const c = new Connection('https://api.devnet.solana.com');
const kp = Keypair.generate();
const w = { publicKey: kp.publicKey, signTransaction: async (t) => t, signAllTransactions: async (t) => t };
const prov = new AnchorProvider(c, w, { commitment: 'confirmed' });
const sap = SapClient.from(prov, new PublicKey(SAP_PROGRAM_ID));
console.log('sap own keys:', Object.keys(sap));
console.log('sap proto:', Object.getOwnPropertyNames(Object.getPrototypeOf(sap)));
console.log('has program:', !!sap.program);
if (sap.program) {
  console.log('program keys:', Object.keys(sap.program).slice(0, 15));
  console.log('program.programId:', sap.program.programId?.toBase58());
}
console.log('has parser:', !!sap.parser);
if (sap.parser) console.log('parser proto:', Object.getOwnPropertyNames(Object.getPrototypeOf(sap.parser)));
