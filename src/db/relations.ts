// src/db/relations.ts
import { relations } from 'drizzle-orm';
import {
    agents, agentStats, tools, escrows,
    attestations, feedbacks, vaults,
    transactions, txDetails,
} from './schema';

export const agentsRelations = relations(agents, ({ one, many }) => ({
    stats:        one(agentStats, { fields: [agents.pda], references: [agentStats.agentPda] }),
    tools:        many(tools),
    escrows:      many(escrows),
    attestations: many(attestations),
    feedbacks:    many(feedbacks),
    vaults:       many(vaults),
}));

export const agentStatsRelations = relations(agentStats, ({ one }) => ({
    agent: one(agents, { fields: [agentStats.agentPda], references: [agents.pda] }),
}));

export const toolsRelations = relations(tools, ({ one }) => ({
    agent: one(agents, { fields: [tools.agentPda], references: [agents.pda] }),
}));

export const escrowsRelations = relations(escrows, ({ one }) => ({
    agent: one(agents, { fields: [escrows.agentPda], references: [agents.pda] }),
}));

export const attestationsRelations = relations(attestations, ({ one }) => ({
    agent: one(agents, { fields: [attestations.agentPda], references: [agents.pda] }),
}));

export const feedbacksRelations = relations(feedbacks, ({ one }) => ({
    agent: one(agents, { fields: [feedbacks.agentPda], references: [agents.pda] }),
}));

export const vaultsRelations = relations(vaults, ({ one }) => ({
    agent: one(agents, { fields: [vaults.agentPda], references: [agents.pda] }),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
    details: one(txDetails, { fields: [transactions.signature], references: [txDetails.signature] }),
}));

export const txDetailsRelations = relations(txDetails, ({ one }) => ({
    transaction: one(transactions, { fields: [txDetails.signature], references: [transactions.signature] }),
}));