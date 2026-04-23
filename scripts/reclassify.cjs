const { drizzle } = require('drizzle-orm/node-postgres');
const { sql, eq } = require('drizzle-orm');
const { pgSchema, text, jsonb } = require('drizzle-orm/pg-core');

const sapExp = pgSchema('sap_exp');
const agents = sapExp.table('agents', { wallet: text('wallet') });
const transactions = sapExp.table('transactions', {
  signature: text('signature').primaryKey(),
  signer: text('signer'),
  memo: text('memo'),
  sapInstructions: jsonb('sap_instructions'),
});
const txDetails = sapExp.table('tx_details', {
  signature: text('signature').primaryKey(),
  tokenBalanceChanges: jsonb('token_balance_changes'),
});

const db = drizzle('postgresql://user_db_sap_exp:p4ssS3Cur3@194.87.141.89:5432/DB_SAP_EXP');

const KNOWN_DECIMALS = {
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 6, // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 6, // USDT
  'So11111111111111111111111111111111111111112': 9,     // SOL
};

(async () => {
  // Find all splTransfer tx_details with raw amounts
  const rows = await db
    .select({ signature: txDetails.signature, tokenBalanceChanges: txDetails.tokenBalanceChanges })
    .from(txDetails)
    .innerJoin(transactions, eq(transactions.signature, txDetails.signature))
    .where(sql`${transactions.sapInstructions}::text LIKE '%splTransfer%'`);

  console.log('splTransfer tx_details found:', rows.length);

  let fixed = 0;
  for (const row of rows) {
    const changes = row.tokenBalanceChanges;
    if (!Array.isArray(changes) || changes.length === 0) continue;

    let needsUpdate = false;
    const newChanges = changes.map(tc => {
      const decimals = KNOWN_DECIMALS[tc.mint] || 6;
      const rawChange = parseFloat(tc.change);
      // If the value looks like a raw amount (> 1000 for a 6-decimal token like USDC)
      // A value of 100000 raw USDC = 0.1 human USDC
      if (rawChange > 100 && decimals > 0) {
        needsUpdate = true;
        const divisor = Math.pow(10, decimals);
        const humanChange = (rawChange / divisor).toString();
        const humanPost = (parseFloat(tc.post) / divisor).toString();
        const humanPre = tc.pre === '0' ? '0' : (parseFloat(tc.pre) / divisor).toString();
        return { ...tc, change: humanChange, post: humanPost, pre: humanPre };
      }
      return tc;
    });

    if (needsUpdate) {
      await db.update(txDetails)
        .set({ tokenBalanceChanges: newChanges })
        .where(eq(txDetails.signature, row.signature));
      fixed++;
      const orig = changes[0];
      const patched = newChanges[0];
      console.log('  Fixed:', row.signature.slice(0, 20), orig.change, '->', patched.change);
    }
  }

  console.log('\nTotal fixed:', fixed);
  process.exit(0);
})();
