/**
 * Central SDK surface for the explorer.
 *
 * synapse-sap-sdk v0.20.0 exports the modules we need publicly, so keep this
 * file as a thin import boundary instead of reaching into node_modules/dist.
 */
export { SapClient } from '@oobe-protocol-labs/synapse-sap-sdk/core';
export type { SapClient as CoreSapClient } from '@oobe-protocol-labs/synapse-sap-sdk/core';
export { SAP_PROGRAM_ADDRESS, SAP_PROGRAM_ID } from '@oobe-protocol-labs/synapse-sap-sdk/constants';
export { SAP_IDL } from '@oobe-protocol-labs/synapse-sap-sdk/idl';
export { EventParser } from '@oobe-protocol-labs/synapse-sap-sdk/events';
export {
  parseSapTransactionComplete,
  TransactionParser,
} from '@oobe-protocol-labs/synapse-sap-sdk/parser';
export type {
  ParsedSapTransaction,
  DecodedSapInstruction,
  DecodedInnerInstruction,
} from '@oobe-protocol-labs/synapse-sap-sdk/parser';
export { serializeAccount } from '@oobe-protocol-labs/synapse-sap-sdk/utils/serialization';
export { deriveAgent } from '@oobe-protocol-labs/synapse-sap-sdk/pda';
export { SapPostgres, SapSyncEngine } from '@oobe-protocol-labs/synapse-sap-sdk/postgres';

export type {
  AgentAccountData,
  AgentStatsData,
  ToolDescriptorData,
  Capability,
  PricingTier,
  VolumeCurveBreakpoint,
  PluginRef,
} from '@oobe-protocol-labs/synapse-sap-sdk/types';

export type {
  DiscoveredAgent,
  AgentProfile,
  NetworkOverview,
  DiscoveredTool,
  ToolCategoryName,
} from '@oobe-protocol-labs/synapse-sap-sdk/registries/discovery';

export type {
  RegisterAgentInput,
  TripleCheckResult,
} from '@oobe-protocol-labs/synapse-sap-sdk/registries/metaplex-bridge';

export type {
  AggregatedReputation,
  AggregateOptions,
} from '@oobe-protocol-labs/synapse-sap-sdk/registries/fairscale';
