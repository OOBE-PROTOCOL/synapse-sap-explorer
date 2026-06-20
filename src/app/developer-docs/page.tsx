"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Bot,
  Check,
  Copy,
  ExternalLink,
  FileJson2,
  Loader2,
  Network,
  Play,
  Terminal,
  TrendingUp,
} from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Dialog, DialogContent } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { cn } from "~/lib/utils";

type EndpointMethod = "GET" | "POST";
type ParamLocation = "path" | "query";

type ApiParam = {
  name: string;
  in: ParamLocation;
  type: string;
  required: boolean;
  defaultValue?: string;
  description: string;
};

type SchemaField = {
  path: string;
  type: string;
  description: string;
};

type TypeReference = {
  id: string;
  label: string;
  kind: "interface" | "type" | "schema";
  source: string;
  description: string;
  code: string;
};

type Endpoint = {
  method: EndpointMethod;
  path: string;
  summary: string;
  params?: string;
  response: string;
  mapsTo?: string;
  stability?: string;
  docSource?: string;
};

type PlaygroundEndpoint = Endpoint & {
  group: string;
  paramsSpec: ApiParam[];
  schemaFields: SchemaField[];
  schemaExample: unknown;
};

type ApiGroup = {
  title: string;
  icon: typeof Activity;
  description: string;
  endpoints: Endpoint[];
};

const PUBLIC_API_DOC = "team_docs/PUBLIC_API_ANALYSIS.md";
const M2_DOC = "team_docs/PUBLIC_API_M2_CURL_TESTS.md";
const M3_DOC = "team_docs/PUBLIC_API_M3_CURL_TESTS.md";

const API_GROUPS: ApiGroup[] = [
  {
    title: "Public API v1 — Status",
    icon: Activity,
    description:
      "Public health and status contract from team_docs/PUBLIC_API_ANALYSIS.md and M2 smoke tests.",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/status",
        summary: "Unified public health check. HTTP 200 returns ok, degraded, or down in data.status.",
        response: "data.status, data.components, meta.requestId",
        mapsTo: "src/lib/api/public/status.ts",
        stability: "Public Beta",
        docSource: `${PUBLIC_API_DOC} §10.1, ${M2_DOC} §3.1`,
      },
    ],
  },
  {
    title: "Public API v1 — Core Discovery",
    icon: Bot,
    description:
      "M2 core endpoints: agents, tools, escrows, transactions, and stable entity details.",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/agents",
        summary: "Public agent list with optional capability/protocol filters.",
        params: "capability, protocol, limit",
        response: "data[] agent objects, meta.total, meta.limit, meta.hasMore",
        mapsTo: "/api/sap/agents",
        stability: "Stable",
        docSource: `${PUBLIC_API_DOC} §9.1, ${M2_DOC} §3.2`,
      },
      {
        method: "GET",
        path: "/api/v1/agents/[wallet]",
        summary: "Public agent detail by wallet or PDA.",
        response: "data agent object, meta.source, meta.requestId",
        mapsTo: "/api/sap/agents/[wallet]",
        stability: "Stable",
        docSource: `${PUBLIC_API_DOC} §9.1, ${M2_DOC} §4`,
      },
      {
        method: "GET",
        path: "/api/v1/tools",
        summary: "Public tool registry list.",
        params: "category",
        response: "data.tools, data.categories, data.total",
        mapsTo: "/api/sap/tools",
        stability: "Stable",
        docSource: `${PUBLIC_API_DOC} §9.2, ${M2_DOC} §3.3`,
      },
      {
        method: "GET",
        path: "/api/v1/escrows",
        summary: "Public escrow list, including active and closed escrows.",
        params: "limit",
        response: "data[] escrow objects, meta.total",
        mapsTo: "/api/sap/escrows",
        stability: "Stable",
        docSource: `${PUBLIC_API_DOC} §9.3, ${M2_DOC} §3.4`,
      },
      {
        method: "GET",
        path: "/api/v1/escrows/[pda]",
        summary: "Public escrow detail by PDA.",
        response: "data escrow object, meta.source, meta.requestId",
        mapsTo: "/api/sap/escrows/[pda]",
        stability: "Stable",
        docSource: `${PUBLIC_API_DOC} §9.3, ${M2_DOC} §4`,
      },
      {
        method: "GET",
        path: "/api/v1/transactions",
        summary: "Public paginated SAP transaction feed.",
        params: "page, perPage",
        response: "data[] transaction summaries, meta.page, meta.limit, meta.hasMore",
        mapsTo: "/api/sap/transactions",
        stability: "Stable",
        docSource: `${PUBLIC_API_DOC} §9.6, ${M2_DOC} §3.5`,
      },
      {
        method: "GET",
        path: "/api/v1/tx/[signature]",
        summary: "Public decoded transaction detail.",
        response: "data decoded transaction, instructions, accounts, events",
        mapsTo: "/api/sap/tx/[signature]",
        stability: "Stable",
        docSource: `${PUBLIC_API_DOC} §9.6, ${M2_DOC} §4`,
      },
    ],
  },
  {
    title: "Public API v1 — Analytics",
    icon: TrendingUp,
    description:
      "M3 analytics endpoints for volume, alerting, and network health.",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/escrows/alerts",
        summary: "Escrows expiring soon and low-balance escrow alerts.",
        params: "hours",
        response: "data.expiringEscrows, data.lowBalanceEscrows, meta.total",
        mapsTo: "/api/sap/escrows/alerts",
        stability: "Stable",
        docSource: `${PUBLIC_API_DOC} §9.3, ${M3_DOC} §2.1`,
      },
      {
        method: "GET",
        path: "/api/v1/volume",
        summary: "Aggregate settlement volume and top agent revenue.",
        response: "data.totalSettledLamports, data.totalCallsSettled, data.topAgentsByRevenue",
        mapsTo: "/api/sap/volume",
        stability: "Stable",
        docSource: `${PUBLIC_API_DOC} §9.3, ${M3_DOC} §2.2`,
      },
      {
        method: "GET",
        path: "/api/v1/volume/daily",
        summary: "Daily or hourly public volume series.",
        params: "bucket, days, hours",
        response: "data.bucket, data.series",
        mapsTo: "/api/sap/volume/daily",
        stability: "Stable",
        docSource: `${PUBLIC_API_DOC} §9.3, ${M3_DOC} §2.3-2.4`,
      },
      {
        method: "GET",
        path: "/api/v1/network/health",
        summary: "Network health rollup with agent, escrow, growth, and expiration metrics.",
        response: "data.agents, data.escrows, data.growth, data.expiringEscrows",
        mapsTo: "/api/sap/network/health",
        stability: "Stable",
        docSource: `${PUBLIC_API_DOC} §9.7, ${M3_DOC} §2.5`,
      },
    ],
  },
  {
    title: "Public API v1 — Network & Lookup",
    icon: Network,
    description:
      "M2 network intelligence plus search and address lookup contracts.",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/network/metrics",
        summary: "Public network metrics from registry and explorer aggregates.",
        response: "data object with aggregate counters",
        mapsTo: "/api/sap/metrics",
        stability: "Stable",
        docSource: `${PUBLIC_API_DOC} §9.7, ${M2_DOC} §3.6`,
      },
      {
        method: "GET",
        path: "/api/v1/network/graph",
        summary: "Public protocol graph for agents, tools, escrows, and relationships.",
        params: "protocol, capability",
        response: "data.nodes, data.links",
        mapsTo: "/api/sap/graph",
        stability: "Stable",
        docSource: `${PUBLIC_API_DOC} §9.7, ${M2_DOC} §3.7`,
      },
      {
        method: "GET",
        path: "/api/v1/network/snapshots",
        summary: "Historical network snapshots.",
        params: "days",
        response: "data[] snapshots, meta.total, meta.limit",
        mapsTo: "/api/sap/snapshots",
        stability: "Stable",
        docSource: `${PUBLIC_API_DOC} §9.7, ${M2_DOC} §3.8`,
      },
      {
        method: "GET",
        path: "/api/v1/search",
        summary: "Public search across SAP entities.",
        params: "q, limit",
        response: "data[] search results, meta.total",
        mapsTo: "/api/sap/search",
        stability: "Stable",
        docSource: `${PUBLIC_API_DOC} §9.6, ${M2_DOC} §3.9`,
      },
      {
        method: "GET",
        path: "/api/v1/address/[address]",
        summary: "Public address profile and entity resolution.",
        response: "data entity profile, balances, related entities",
        mapsTo: "/api/sap/address/[address]",
        stability: "Stable",
        docSource: `${PUBLIC_API_DOC} §9.6, ${M2_DOC} §4`,
      },
    ],
  },
];

const DEFAULT_VALUES: Record<string, string> = {
  wallet: "6ZTMVhTK5i1dphmrdCHMgbtKhy9roPSsoesPEt9oPXRA",
  id: "Ccr2yK3hLALU4p8oNRqrh4dGuvPJTth5KCLMio8cE1ph",
  pda: "BACHLq6o2kVbz4q5Pdb6FCQNpTzTT8gq9sjBYYPrbuFE",
  address: "BACHLq6o2kVbz4q5Pdb6FCQNpTzTT8gq9sjBYYPrbuFE",
  signature:
    "58b5bXZ5N174czZiZHUA6b42553abjGNCLQfdNkSBhGm2fUAEbNW8PUqiDzZZVhyopBeHB6qxrNoyDjEcinc7YWX",
  page: "1",
  perPage: "10",
  limit: "25",
  capability: "",
  protocol: "",
  category: "",
  hours: "48",
  days: "30",
  bucket: "daily",
  scope: "network",
  q: "auditor",
  type: "",
  status: "",
  agent: "",
  depositor: "",
  active: "",
  instruction: "",
  addressQuery: "",
  after: "",
  cursor: "",
};

const REQUIRED_QUERY_PARAMS = new Set(["q"]);
const PATH_PARAM_RE = /\[([^\]]+)\]/g;

const TYPE_REFERENCES: Record<string, TypeReference> = {
  PublicApiEnvelope: {
    id: "publicapienvelope",
    label: "PublicApiEnvelope<T>",
    kind: "type",
    source: "team_docs/PUBLIC_API_ANALYSIS.md",
    description: "Standard public API envelope used by /api/v1 routes.",
    code: `export type PublicApiEnvelope<T> = {
  data: T | null;
  meta: {
    requestId: string;
    source: "cache" | "db" | "rpc" | "degraded";
    generatedAt: string;
    total?: number;
    limit?: number;
    page?: number;
    hasMore?: boolean;
  };
  error: null | {
    code:
      | "INVALID_PARAM"
      | "NOT_FOUND"
      | "DB_UNAVAILABLE"
      | "RATE_LIMITED"
      | "UPSTREAM_UNAVAILABLE";
    message: string;
    details?: unknown;
  };
};`,
  },
  SapStatus: {
    id: "sapstatus",
    label: "SapStatus",
    kind: "interface",
    source: "src/lib/api/public/status.ts",
    description: "Public health shape for database, RPC, and indexer readiness.",
    code: `export interface SapStatus {
  status: "ok" | "degraded" | "down";
  components: {
    database: {
      status: "ok" | "degraded" | "down";
      latencyMs?: number;
      error?: string;
    };
    rpc: {
      status: "ok" | "degraded" | "down";
      endpoint?: string;
      latencyMs?: number;
      slot?: number;
      error?: string;
    };
    indexer: {
      status: "ok" | "degraded" | "down";
      entities: Record<string, {
        lastSyncedAt?: string;
        lastSlot?: number;
        lagSeconds?: number;
      }>;
    };
  };
}`,
  },
  SapTx: {
    id: "saptx",
    label: "SapTx",
    kind: "interface",
    source: "src/app/transactions/page.tsx",
    description: "Transaction row consumed by the explorer table and live transaction widgets.",
    code: `export interface SapTx {
  signature: string;
  slot: number;
  blockTime: string | null;
  success: boolean;
  action: string;
  signer: string | null;
  interactedWith: {
    address: string;
    label?: string;
    kind?: "agent" | "tool" | "vault" | "escrow" | "program";
  } | null;
  value: {
    amount: string;
    symbol: "SOL" | "USDC" | string;
    decimals: number;
    usdValue?: number;
  } | null;
  feeSol: number;
  programs: string[];
  sapInstructions: string[];
}`,
  },
  EnrichedAgent: {
    id: "enrichedagent",
    label: "EnrichedAgent",
    kind: "interface",
    source: "src/app/api/sap/agents/enriched/route.ts",
    description: "Agent identity plus balances, metadata, revenue, logos, staking, and data-quality signals.",
    code: `export interface EnrichedAgent {
  pda: string;
  wallet: string;
  identity: {
    name: string;
    description?: string;
    logoUrl?: string;
    endpoint?: string;
    protocol?: string;
  };
  capabilities: string[];
  tools: Tool[];
  settlementStats: {
    settledSol: number;
    settledUsdc: number;
    settledCalls: number;
    escrowCount: number;
  };
  balances: {
    sol: number;
    usdc: number;
    tokens: TokenBalance[];
  };
  reputation?: {
    score?: number;
    reviews?: number;
    trustLevel?: "low" | "medium" | "high";
  };
  dataQuality: {
    status: "complete" | "partial" | "degraded";
    sources: string[];
  };
}`,
  },
  Tool: {
    id: "tool",
    label: "Tool",
    kind: "interface",
    source: "team_docs/PUBLIC_API_ANALYSIS.md",
    description: "Public SAP tool descriptor exposed by /api/v1/tools and agent details.",
    code: `export interface Tool {
  pda: string;
  agentPda: string;
  name: string;
  method: "get" | "post" | "put" | "patch" | "delete" | string;
  category: string;
  description?: string;
  endpoint?: string;
  schema?: {
    input?: JSONSchema7;
    output?: JSONSchema7;
    description?: JSONSchema7;
  };
  schemaInscriptions?: Array<{
    kind: "input" | "output" | "description";
    schemaHash: string;
    tx: string;
    inscribedAt: string;
    verified: boolean;
  }>;
  stats: {
    settledCalls: number;
    settledVolumeSol: number;
    settledVolumeUsdc: number;
  };
}`,
  },
  Escrow: {
    id: "escrow",
    label: "Escrow",
    kind: "interface",
    source: "team_docs/PUBLIC_API_ANALYSIS.md",
    description: "Public escrow record with token-aware settlement counters.",
    code: `export interface Escrow {
  pda: string;
  agentPda: string;
  depositor: string;
  agentWallet?: string;
  status: "active" | "closed" | "expired" | "settled";
  tokenMint: string | null;
  tokenSymbol: "SOL" | "USDC" | string;
  tokenDecimals: number;
  balance: string;
  totalDeposited: string;
  totalSettled: string;
  totalCallsSettled: number;
  pricePerCall: string;
  maxCalls?: number;
  createdAt?: string;
  closedAt?: string | null;
  expiresAt?: string | null;
  lastSettledAt?: string | null;
}`,
  },
  EscrowAlert: {
    id: "escrowalert",
    label: "EscrowAlert",
    kind: "type",
    source: "team_docs/PUBLIC_API_M3_CURL_TESTS.md",
    description: "M3 escrow alert item for expiring or low-balance escrows.",
    code: `export type EscrowAlert = {
  escrow: Escrow;
  type: "expiring" | "low_balance";
  severity: "info" | "warning" | "critical";
  message: string;
  threshold?: string;
  detectedAt: string;
};`,
  },
  TokenBalance: {
    id: "tokenbalance",
    label: "TokenBalance",
    kind: "type",
    source: "src/lib/sap/agent-enrichment-store.ts",
    description: "SPL token balance with mint, symbol, decimals, amount, and metadata fields.",
    code: `export type TokenBalance = {
  mint: string;
  symbol: string;
  decimals: number;
  amount: string;
  uiAmount: number;
  usdValue?: number;
  logoUrl?: string;
  metadata?: {
    name?: string;
    source?: "metaplex" | "token-list" | "cache";
  };
};`,
  },
  JSONSchema7: {
    id: "jsonschema7",
    label: "JSONSchema7",
    kind: "schema",
    source: "src/app/api/sap/tools/[pda]/schemas/route.ts",
    description: "Decoded tool schema inscription compatible with JSON Schema draft-07 shapes.",
    code: `export type JSONSchema7 = {
  $schema?: string;
  $id?: string;
  title?: string;
  description?: string;
  type?: string | string[];
  required?: string[];
  properties?: Record<string, JSONSchema7>;
  items?: JSONSchema7 | JSONSchema7[];
  enum?: unknown[];
  const?: unknown;
  default?: unknown;
  additionalProperties?: boolean | JSONSchema7;
  oneOf?: JSONSchema7[];
  anyOf?: JSONSchema7[];
  allOf?: JSONSchema7[];
};`,
  },
  VolumeSummary: {
    id: "volumesummary",
    label: "VolumeSummary",
    kind: "interface",
    source: "team_docs/PUBLIC_API_M3_CURL_TESTS.md",
    description: "Aggregate public settlement volume with top revenue agents.",
    code: `export interface VolumeSummary {
  totalSettledLamports: string;
  totalSettledSol: number;
  totalSettledUsdc: number;
  totalCallsSettled: number;
  topAgentsByRevenue: RevenueAgent[];
}`,
  },
  RevenueAgent: {
    id: "revenueagent",
    label: "RevenueAgent",
    kind: "interface",
    source: "team_docs/PUBLIC_API_M3_CURL_TESTS.md",
    description: "Single ranked SAP agent in the public revenue leaderboard.",
    code: `export interface RevenueAgent {
  agentPda: string;
  wallet?: string;
  name?: string;
  logoUrl?: string;
  settledSol: number;
  settledUsdc: number;
  settledCalls: number;
  escrowCount: number;
  rank: number;
}`,
  },
  VolumeBucket: {
    id: "volumebucket",
    label: "VolumeBucket",
    kind: "interface",
    source: "team_docs/PUBLIC_API_M3_CURL_TESTS.md",
    description: "Daily or hourly public settlement bucket.",
    code: `export interface VolumeBucket {
  bucketStart: string;
  bucket: "daily" | "hourly";
  settledSol: number;
  settledUsdc: number;
  calls: number;
  escrows: number;
}`,
  },
  NetworkMetrics: {
    id: "networkmetrics",
    label: "NetworkMetrics",
    kind: "interface",
    source: "team_docs/PUBLIC_API_M2_CURL_TESTS.md",
    description: "Public network counters used by dashboards and status pages.",
    code: `export interface NetworkMetrics {
  agents: number;
  activeAgents: number;
  tools: number;
  capabilities: number;
  escrows: number;
  vaults: number;
  transactions: number;
  settledCalls: number;
  settledVolumeSol: number;
  settledVolumeUsdc: number;
}`,
  },
  GraphNode: {
    id: "graphnode",
    label: "GraphNode",
    kind: "type",
    source: "src/app/api/sap/graph/route.ts",
    description: "Network graph node for agents, tools, escrows, vaults, and protocol entities.",
    code: `export type GraphNode = {
  id: string;
  label: string;
  kind: "agent" | "tool" | "escrow" | "vault" | "protocol" | "wallet";
  href?: string;
  logoUrl?: string;
  metrics?: {
    volumeSol?: number;
    volumeUsdc?: number;
    calls?: number;
    score?: number;
  };
};`,
  },
  GraphEdge: {
    id: "graphedge",
    label: "GraphEdge",
    kind: "type",
    source: "src/app/api/sap/graph/route.ts",
    description: "Relationship edge connecting SAP entities in the protocol graph.",
    code: `export type GraphEdge = {
  source: string;
  target: string;
  kind:
    | "owns"
    | "registers"
    | "settles"
    | "deposits"
    | "calls"
    | "inscribes";
  weight?: number;
  label?: string;
};`,
  },
  NetworkHealth: {
    id: "networkhealth",
    label: "NetworkHealth",
    kind: "interface",
    source: "team_docs/PUBLIC_API_M3_CURL_TESTS.md",
    description: "Public M3 health rollup for agents, escrows, growth, and expiring escrows.",
    code: `export interface NetworkHealth {
  agents: {
    total: number;
    active: number;
    degraded: number;
  };
  escrows: {
    total: number;
    active: number;
    expiring: number;
    lowBalance: number;
  };
  growth: {
    agents24h: number;
    transactions24h: number;
    settledCalls24h: number;
  };
  expiringEscrows: EscrowAlert[];
}`,
  },
  NetworkSnapshot: {
    id: "networksnapshot",
    label: "NetworkSnapshot",
    kind: "interface",
    source: "team_docs/PUBLIC_API_M2_CURL_TESTS.md",
    description: "Historical protocol snapshot for trend views.",
    code: `export interface NetworkSnapshot {
  date: string;
  agents: number;
  tools: number;
  escrows: number;
  vaults: number;
  transactions: number;
  settledCalls: number;
  settledVolumeSol: number;
  settledVolumeUsdc: number;
}`,
  },
  SearchResult: {
    id: "searchresult",
    label: "SearchResult",
    kind: "type",
    source: "team_docs/PUBLIC_API_M2_CURL_TESTS.md",
    description: "Typed public search result across SAP entities.",
    code: `export type SearchResult = {
  type: "agent" | "tool" | "escrow" | "vault" | "transaction" | "address";
  id: string;
  label: string;
  description?: string;
  href: string;
  score?: number;
  logoUrl?: string;
};`,
  },
  AddressProfile: {
    id: "addressprofile",
    label: "AddressProfile",
    kind: "interface",
    source: "team_docs/PUBLIC_API_ANALYSIS.md",
    description: "Resolved wallet/PDA profile and related SAP entities.",
    code: `export interface AddressProfile {
  address: string;
  entity: {
    type: "wallet" | "agent" | "tool" | "vault" | "escrow" | "program";
    label?: string;
    href?: string;
  } | null;
  balance: {
    sol?: number;
    usdc?: number;
    tokens?: TokenBalance[];
  } | null;
  related: {
    agents: EnrichedAgent[];
    tools: Tool[];
    escrows: Escrow[];
    transactions: SapTx[];
  };
}`,
  },
};

function endpointKey(endpoint: Endpoint) {
  return `${endpoint.method} ${endpoint.path}`;
}

function endpointAnchor(endpoint: Endpoint) {
  return endpointKey(endpoint)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function getPathParamNames(path: string) {
  return Array.from(path.matchAll(PATH_PARAM_RE)).map((match) => match[1]);
}

function describeParam(name: string, location: ParamLocation): string {
  if (location === "path") {
    if (name === "wallet") return "Agent wallet or SAP PDA.";
    if (name === "pda") return "Program-derived address for the selected SAP entity.";
    if (name === "signature") return "Base58 Solana transaction signature.";
    if (name === "address") return "Wallet, PDA, vault, escrow, or tool address.";
    if (name === "id") return "Resolvable wallet, PDA, or known label.";
  }
  const descriptions: Record<string, string> = {
    page: "One-indexed result page.",
    perPage: "Rows per page.",
    limit: "Maximum number of rows or buckets.",
    scope: "Activity scope, for example network, agent, tool, or escrow.",
    q: "Search text.",
    type: "Optional entity or event type filter.",
    status: "Escrow status filter.",
    agent: "Agent wallet or PDA filter.",
    depositor: "Depositor wallet filter.",
    active: "Boolean active-state filter.",
    instruction: "SAP instruction filter.",
    after: "Only return live rows after this slot.",
    cursor: "Pagination cursor returned by the previous response.",
    capability: "Capability filter from the Public API v1 agent contract.",
    protocol: "Protocol filter for agents or graph nodes.",
    category: "Tool category filter.",
    hours: "Look-ahead window in hours; server clamps to the documented maximum.",
    days: "Historical lookback in days; server clamps to the documented maximum.",
    bucket: 'Volume bucket: "daily" or "hourly".',
  };
  return descriptions[name] ?? "Optional filter.";
}

function inferParams(endpoint: Endpoint): ApiParam[] {
  const pathParams = getPathParamNames(endpoint.path).map((name) => ({
    name,
    in: "path" as const,
    type: "string",
    required: true,
    defaultValue: DEFAULT_VALUES[name] ?? "",
    description: describeParam(name, "path"),
  }));

  const queryNames =
    endpoint.params?.split(",").map((param) => param.trim()).filter(Boolean) ?? [];
  const queryParams = queryNames.map((name) => ({
    name,
    in: "query" as const,
    type: ["page", "perPage", "limit", "after", "hours", "days"].includes(name)
      ? "number"
      : "string",
    required: REQUIRED_QUERY_PARAMS.has(name),
    defaultValue:
      name === "address" ? DEFAULT_VALUES.addressQuery : DEFAULT_VALUES[name] ?? "",
    description: describeParam(name, "query"),
  }));

  return [...pathParams, ...queryParams];
}

function schemaFieldsFor(endpoint: Endpoint): SchemaField[] {
  const path = endpoint.path;
  const envelope: SchemaField[] = [
    { path: "data", type: "PublicApiEnvelope", description: endpoint.response },
    { path: "meta.requestId", type: "string", description: "Request id from the standard Public API envelope." },
    { path: "meta.source", type: "string", description: "Data source such as db, cache, rpc, or degraded fallback." },
    { path: "error.code", type: "string | null", description: "Present only for failures: INVALID_PARAM, NOT_FOUND, DB_UNAVAILABLE, RATE_LIMITED, and related codes." },
  ];

  if (path === "/api/v1/status") {
    return [
      { path: "data", type: "SapStatus", description: "Public health check payload." },
      { path: "data.status", type: "string", description: "ok, degraded, or down." },
      { path: "data.components.database", type: "object", description: "Database health and latency." },
      { path: "data.components.rpc", type: "object", description: "RPC health and latency." },
      { path: "data.components.indexer", type: "object", description: "Indexer freshness by entity." },
      ...envelope.slice(1),
    ];
  }
  if (path === "/api/v1/agents") {
    return [
      { path: "data[]", type: "EnrichedAgent[]", description: "Public SAP agent records." },
      { path: "meta.total", type: "number", description: "Total agents matching filters." },
      { path: "meta.limit", type: "number", description: "Applied limit, capped server-side." },
      { path: "meta.hasMore", type: "boolean", description: "Whether more records exist beyond this page." },
      ...envelope.slice(1),
    ];
  }
  if (path === "/api/v1/agents/[wallet]") {
    return [
      { path: "data", type: "EnrichedAgent", description: "Resolved public SAP agent profile." },
      { path: "data.pda", type: "string", description: "Resolved SAP agent PDA." },
      { path: "data.identity", type: "object", description: "Stable public agent identity." },
      { path: "data.reputation", type: "object | null", description: "Reputation and trust summary when available." },
      { path: "data.settlementStats", type: "object | null", description: "Settlement totals exposed by the public adapter." },
      ...envelope.slice(1),
    ];
  }
  if (path === "/api/v1/tools") {
    return [
      { path: "data.tools[]", type: "Tool[]", description: "Public tool descriptors." },
      { path: "data.categories[]", type: "string[]", description: "Available tool categories." },
      { path: "data.total", type: "number", description: "Total tool count." },
      ...envelope.slice(1),
    ];
  }
  if (path === "/api/v1/escrows") {
    return [
      { path: "data[]", type: "Escrow[]", description: "Public escrow records, including closed escrows." },
      { path: "data[].totalSettled", type: "string", description: "Raw token amount settled." },
      { path: "data[].totalCallsSettled", type: "number", description: "Settled call count." },
      { path: "meta.total", type: "number", description: "Total escrow count." },
      ...envelope.slice(1),
    ];
  }
  if (path === "/api/v1/escrows/[pda]") {
    return [
      { path: "data", type: "Escrow", description: "Public escrow detail." },
      { path: "data.pda", type: "string", description: "Escrow PDA." },
      { path: "data.agent", type: "string", description: "Agent PDA." },
      { path: "data.depositor", type: "string", description: "Depositor wallet." },
      { path: "data.tokenMint", type: "string | null", description: "SOL or SPL token mint." },
      ...envelope.slice(1),
    ];
  }
  if (path === "/api/v1/escrows/alerts") {
    return [
      { path: "data.expiringEscrows[]", type: "EscrowAlert[]", description: "Escrows expiring inside the requested hours window." },
      { path: "data.lowBalanceEscrows[]", type: "EscrowAlert[]", description: "Escrows with low remaining balance." },
      { path: "meta.total", type: "number", description: "Combined alert count." },
      ...envelope.slice(1),
    ];
  }
  if (path === "/api/v1/transactions") {
    return [
      { path: "data[]", type: "SapTx[]", description: "Stable public transaction summaries." },
      { path: "data[].signature", type: "string", description: "Solana transaction signature." },
      { path: "meta.page", type: "number", description: "Current page." },
      { path: "meta.limit", type: "number", description: "Rows per page." },
      { path: "meta.hasMore", type: "boolean", description: "Whether more pages are available." },
      ...envelope.slice(1),
    ];
  }
  if (path === "/api/v1/tx/[signature]") {
    return [
      { path: "data.summary", type: "SapTx", description: "Explorer transaction summary." },
      { path: "data.instructions[]", type: "object[]", description: "Decoded instruction tree." },
      { path: "data.events[]", type: "object[]", description: "Parsed SAP events." },
      { path: "data.logs[]", type: "string[]", description: "Program logs." },
      ...envelope.slice(1),
    ];
  }
  if (path === "/api/v1/volume") {
    return [
      { path: "data", type: "VolumeSummary", description: "Aggregate public settlement volume." },
      { path: "data.totalSettledLamports", type: "string", description: "Total settled SOL-denominated raw lamports." },
      { path: "data.totalCallsSettled", type: "number", description: "Total settled calls." },
      { path: "data.topAgentsByRevenue[]", type: "RevenueAgent[]", description: "Top SAP agents by indexed settlement volume." },
      ...envelope.slice(1),
    ];
  }
  if (path === "/api/v1/volume/daily") {
    return [
      { path: "data.bucket", type: "string", description: "daily or hourly." },
      { path: "data.series[]", type: "VolumeBucket[]", description: "Volume buckets for the selected period." },
      ...envelope.slice(1),
    ];
  }
  if (path === "/api/v1/network/metrics") {
    return [
      { path: "data", type: "NetworkMetrics", description: "Aggregate network metrics." },
      ...envelope.slice(1),
    ];
  }
  if (path === "/api/v1/network/graph") {
    return [
      { path: "data.nodes[]", type: "GraphNode[]", description: "Protocol graph nodes." },
      { path: "data.links[]", type: "GraphEdge[]", description: "Protocol graph relationships." },
      ...envelope.slice(1),
    ];
  }
  if (path === "/api/v1/network/snapshots") {
    return [
      { path: "data[]", type: "NetworkSnapshot[]", description: "Historical network snapshots." },
      { path: "meta.total", type: "number", description: "Total snapshots returned." },
      { path: "meta.limit", type: "number", description: "Applied day limit." },
      ...envelope.slice(1),
    ];
  }
  if (path === "/api/v1/network/health") {
    return [
      { path: "data", type: "NetworkHealth", description: "Network health payload." },
      { path: "data.agents", type: "object", description: "Agent health rollup." },
      { path: "data.escrows", type: "object", description: "Escrow health rollup." },
      { path: "data.growth", type: "object", description: "Growth metrics." },
      { path: "data.expiringEscrows[]", type: "EscrowAlert[]", description: "Expiring escrow warnings." },
      ...envelope.slice(1),
    ];
  }
  if (path === "/api/v1/search") {
    return [
      { path: "data[]", type: "SearchResult[]", description: "Typed public search results." },
      { path: "meta.total", type: "number", description: "Total result count." },
      ...envelope.slice(1),
    ];
  }
  if (path === "/api/v1/address/[address]") {
    return [
      { path: "data", type: "AddressProfile", description: "Resolved public address profile." },
      { path: "data.entity", type: "object | null", description: "Resolved public entity profile." },
      { path: "data.balance", type: "object | null", description: "SOL balance and account-level context." },
      { path: "data.related", type: "object", description: "Related agents, tools, vaults, escrows, or transactions." },
      ...envelope.slice(1),
    ];
  }
  return envelope;
}

function schemaExampleFor(endpoint: Endpoint, fields: SchemaField[]) {
  return {
    endpoint: endpoint.path,
    method: endpoint.method,
    shape: Object.fromEntries(
      fields.slice(0, 6).map((field) => [
        field.path.replace(/\[\]/g, ""),
        `<${field.type}>`,
      ]),
    ),
  };
}

function buildPlaygroundEndpoints(): PlaygroundEndpoint[] {
  return API_GROUPS.flatMap((group) =>
    group.endpoints.map((endpoint) => {
      const schemaFields = schemaFieldsFor(endpoint);
      return {
        ...endpoint,
        group: group.title,
        paramsSpec: inferParams(endpoint),
        schemaFields,
        schemaExample: schemaExampleFor(endpoint, schemaFields),
      };
    }),
  );
}

function initialValues(endpoint: PlaygroundEndpoint) {
  return Object.fromEntries(
    endpoint.paramsSpec.map((param) => [param.name, param.defaultValue ?? ""]),
  );
}

function buildRequestPath(endpoint: PlaygroundEndpoint, values: Record<string, string>) {
  const path = endpoint.path.replace(PATH_PARAM_RE, (_, param: string) =>
    encodeURIComponent(values[param]?.trim() ?? ""),
  );
  const params = new URLSearchParams();
  for (const param of endpoint.paramsSpec.filter((item) => item.in === "query")) {
    const value = values[param.name]?.trim();
    if (value) params.set(param.name, value);
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function getCodeSamples(endpoint: PlaygroundEndpoint, requestPath: string) {
  const url = `http://localhost:3000${requestPath}`;
  return {
    curl: `curl -s -X ${endpoint.method} '${url}' \\\n  -H 'Accept: application/json'`,
    typescript: `const response = await fetch("${url}", {\n  method: "${endpoint.method}",\n  headers: { Accept: "application/json" },\n  cache: "no-store",\n});\n\nif (!response.ok) {\n  throw new Error(\`SAP Explorer API failed: \${response.status}\`);\n}\n\nconst data = await response.json();`,
    python: `import requests\n\nresponse = requests.get(\n    "${url}",\n    headers={"Accept": "application/json"},\n    timeout=30,\n)\nresponse.raise_for_status()\n\ndata = response.json()`,
    node: `import { request } from "node:https";\n\nconst url = new URL("${url}");\nconst req = request(url, { method: "${endpoint.method}", headers: { Accept: "application/json" } }, (res) => {\n  let body = "";\n  res.on("data", (chunk) => (body += chunk));\n  res.on("end", () => console.log(JSON.parse(body)));\n});\nreq.end();`,
  };
}

function MethodBadge({ method }: { method: EndpointMethod }) {
  return (
    <span className="inline-flex h-6 items-center rounded-md border border-primary/25 bg-primary/10 px-2 font-mono text-xs font-semibold text-primary">
      {method}
    </span>
  );
}

function baseTypeName(type: string) {
  return type
    .replace(/\[\]/g, "")
    .replace(/[{}]/g, "")
    .trim();
}

const TS_TOKEN_RE =
  /(\/\/.*$)|("[^"]*"|'[^']*'|`[^`]*`)|(\b(?:export|interface|type|extends|Record|Array|Promise|const|let|var|return|null|unknown|string|number|boolean)\b)|(\b[A-Z][A-Za-z0-9_]*\b)/g;

function highlightLine(line: string) {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  for (const match of line.matchAll(TS_TOKEN_RE)) {
    const [value, comment, quoted, keyword, typeName] = match;
    const index = match.index ?? 0;
    if (index > lastIndex) nodes.push(line.slice(lastIndex, index));
    if (comment) {
      nodes.push(
        <span key={`${index}-comment`} className="text-muted-foreground">
          {value}
        </span>,
      );
    } else if (quoted) {
      nodes.push(
        <span key={`${index}-string`} className="text-chart-2">
          {value}
        </span>,
      );
    } else if (keyword) {
      nodes.push(
        <span key={`${index}-keyword`} className="text-primary">
          {value}
        </span>,
      );
    } else if (typeName) {
      nodes.push(
        <span key={`${index}-type`} className="text-chart-4">
          {value}
        </span>,
      );
    }
    lastIndex = index + value.length;
  }
  if (lastIndex < line.length) nodes.push(line.slice(lastIndex));
  return nodes;
}

function HighlightedCode({ code }: { code: string }) {
  return (
    <code>
      {code.split("\n").map((line, index) => (
        <span key={`${index}-${line}`} className="block">
          <span className="select-none pr-4 text-muted-foreground">{index + 1}</span>
          {highlightLine(line)}
        </span>
      ))}
    </code>
  );
}

function TypeInline({
  type,
  onOpenType,
}: {
  type: string;
  onOpenType: (reference: TypeReference) => void;
}) {
  const parts = type.split(/(\s+\|\s+)/);
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-md leading-7">
      {parts.map((part, index) => {
        if (part.includes("|")) {
          return <span key={`${part}-${index}`} className="text-muted-foreground">|</span>;
        }
        const trimmed = part.trim();
        if (!trimmed) return null;
        const ref = TYPE_REFERENCES[baseTypeName(trimmed)];
        if (!ref) {
          return (
            <span key={`${part}-${index}`} className="text-muted-foreground">
              {trimmed}
            </span>
          );
        }
        return (
          <button
            key={`${part}-${index}`}
            type="button"
            onClick={() => onOpenType(ref)}
            className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 font-mono text-md text-primary transition-colors hover:bg-primary/15 hover:text-primary"
          >
            {trimmed}
          </button>
        );
      })}
    </span>
  );
}

function TypeReferenceDialog({
  reference,
  onOpenChange,
}: {
  reference: TypeReference | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={Boolean(reference)} onOpenChange={onOpenChange}>
      <DialogContent
        aria-labelledby="type-reference-title"
        className="w-[calc(100vw-1.5rem)] max-w-4xl overflow-hidden p-0"
      >
        {reference && (
          <div className="flex max-h-[85vh] flex-col">
            <div className="border-b bg-muted/20 p-4 pr-12 xs:p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <Badge variant="outline">{reference.kind}</Badge>
                  <h2
                    id="type-reference-title"
                    className="mt-3 break-words font-mono text-lg font-semibold text-foreground md:text-xl"
                  >
                    {reference.label}
                  </h2>
                  <p className="mt-2 text-md leading-7 text-muted-foreground">
                    {reference.description}
                  </p>
                  <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                    {reference.source}
                  </p>
                </div>
                <CopyButton value={reference.code} label="Copy type" />
              </div>
            </div>
            <pre className="overflow-auto bg-background p-4 font-mono text-xs leading-6 text-foreground xs:p-5 md:text-sm">
              <HighlightedCode code={reference.code} />
            </pre>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={async () => {
        if (!value) return;
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

function CodeBlock({ value }: { value: string }) {
  return (
    <pre className="max-h-[520px] overflow-auto rounded-xl border bg-background p-4 font-mono text-xs leading-5 text-foreground">
      {value}
    </pre>
  );
}

type PlaygroundResponse = {
  status: number;
  ok: boolean;
  durationMs: number;
  body: string;
  contentType: string | null;
  fromCache?: boolean;
};

const PLAYGROUND_RESPONSE_CACHE_MS = 30_000;
const playgroundResponseCache = new Map<
  string,
  { expiresAt: number; response: PlaygroundResponse }
>();
const playgroundInFlight = new Map<string, Promise<PlaygroundResponse>>();

function endpointTitle(endpoint: PlaygroundEndpoint) {
  if (endpoint.path === "/api/sap/overview") return "SAP HTTP API Methods";
  const leaf = endpoint.path.split("/").filter(Boolean).at(-1) ?? endpoint.path;
  return leaf
    .replace(/\[|\]/g, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function markdownForEndpoint(endpoint: PlaygroundEndpoint, requestPath: string) {
  const params = endpoint.paramsSpec.length
    ? endpoint.paramsSpec
        .map(
          (param) =>
            `- \`${param.name}\` (${param.in}, ${param.type}, ${
              param.required ? "required" : "optional"
            }): ${param.description}`,
        )
        .join("\n")
    : "- No parameters required.";
  const result = endpoint.schemaFields
    .map((field) => `- \`${field.path}\` (${field.type}): ${field.description}`)
    .join("\n");

  return `# ${endpointTitle(endpoint)}\n\n${endpoint.summary}\n\n## Endpoint\n\n\`${endpoint.method} ${requestPath}\`\n\n## Params\n\n${params}\n\n## Result\n\n${result}`;
}

function DocsSidebar({
  selectedKey,
  onSelect,
}: {
  selectedKey: string;
  onSelect: (value: string) => void;
}) {
  return (
    <aside className="hidden h-full border-r bg-background/70 xl:block">
      <div className="sticky top-0 h-full overflow-auto p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">SAP API Methods</p>
          <Badge variant="outline">{API_GROUPS.length}</Badge>
        </div>
        <nav className="mt-5 flex flex-col gap-5">
          {API_GROUPS.map((group) => {
            const Icon = group.icon;
            return (
              <div key={group.title} className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Icon className="h-3.5 w-3.5" />
                  <span>{group.title}</span>
                </div>
                <div className="flex flex-col gap-1 border-l pl-3">
                  {group.endpoints.map((endpoint) => {
                    const key = endpointKey(endpoint);
                    const active = key === selectedKey;
                    return (
                      <Link
                        key={key}
                        href={`/developer-docs#${endpointAnchor(endpoint)}`}
                        onClick={(event) => {
                          event.preventDefault();
                          onSelect(key);
                          window.history.replaceState(null, "", `/developer-docs#${endpointAnchor(endpoint)}`);
                        }}
                        className={cn(
                          "rounded-lg px-3 py-2 text-left text-sm transition-colors",
                          active
                            ? "bg-muted text-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                      >
                        <span className="block truncate font-mono text-xs">
                          {endpoint.path.split("/").filter(Boolean).at(-1) ?? endpoint.path}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}

function ApiDocsConsole({ endpoints }: { endpoints: PlaygroundEndpoint[] }) {
  const [selectedKey, setSelectedKey] = useState(endpointKey(endpoints[0]));
  const endpoint =
    endpoints.find((item) => endpointKey(item) === selectedKey) ?? endpoints[0];
  const [values, setValues] = useState(() => initialValues(endpoint));
  const [response, setResponse] = useState<PlaygroundResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [selectedReference, setSelectedReference] = useState<TypeReference | null>(null);

  const requestPath = buildRequestPath(endpoint, values);
  const samples = getCodeSamples(endpoint, requestPath);
  const requiredParams = endpoint.paramsSpec.filter((param) => param.required);
  const optionalParams = endpoint.paramsSpec.filter((param) => !param.required);
  const markdown = markdownForEndpoint(endpoint, requestPath);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;
    const matched = endpoints.find((item) => endpointAnchor(item) === hash);
    if (matched) selectEndpoint(endpointKey(matched));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoints]);

  function selectEndpoint(value: string) {
    const next = endpoints.find((item) => endpointKey(item) === value) ?? endpoints[0];
    setSelectedKey(value);
    setValues(initialValues(next));
    setResponse(null);
    setError(null);
  }

  async function runRequest() {
    const cacheKey = `${endpoint.method} ${requestPath}`;
    const cached = playgroundResponseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      setError(null);
      setResponse({ ...cached.response, durationMs: 0, fromCache: true });
      return;
    }

    setRunning(true);
    setError(null);
    setResponse(null);
    try {
      let request = playgroundInFlight.get(cacheKey);
      if (!request) {
        const started = performance.now();
        request = fetch(requestPath, {
          method: endpoint.method,
          headers: { Accept: "application/json" },
        }).then(async (res) => {
          const text = await res.text();
          let body = text;
          try {
            body = formatJson(JSON.parse(text));
          } catch {
            body = text;
          }
          return {
            status: res.status,
            ok: res.ok,
            durationMs: Math.round(performance.now() - started),
            body,
            contentType: res.headers.get("content-type"),
          };
        });
        playgroundInFlight.set(cacheKey, request);
      }

      const nextResponse = await request;
      playgroundResponseCache.set(cacheKey, {
        expiresAt: Date.now() + PLAYGROUND_RESPONSE_CACHE_MS,
        response: nextResponse,
      });
      setResponse(nextResponse);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Request failed");
    } finally {
      playgroundInFlight.delete(cacheKey);
      setRunning(false);
    }
  }

  function renderParam(param: ApiParam) {
    return (
      <div key={`${param.in}-${param.name}`} className="rounded-xl border bg-background p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="text-md leading-7 text-muted-foreground">
              {param.in} · {param.type} · {param.required ? "required" : "optional"}
            </p>
            <Label htmlFor={`param-${param.name}`} className="mt-2 block font-mono text-md">
              {param.name}
            </Label>
            <p className="mt-1 text-md leading-7 text-muted-foreground">{param.description}</p>
          </div>
          <Input
            id={`param-${param.name}`}
            value={values[param.name] ?? ""}
            onChange={(event) =>
              setValues((current) => ({ ...current, [param.name]: event.target.value }))
            }
            placeholder={`${param.type} ${param.required ? "" : "(optional)"}`.trim()}
            className="h-12 font-mono text-md md:max-w-sm"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden border bg-card xs:rounded-2xl">
      <TypeReferenceDialog
        reference={selectedReference}
        onOpenChange={(open) => {
          if (!open) setSelectedReference(null);
        }}
      />
      <div className="grid xl:grid-cols-[280px_minmax(0,1fr)]">
        <DocsSidebar selectedKey={selectedKey} onSelect={selectEndpoint} />

        <div className="min-w-0">
          <div className="border-b bg-card/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-card/80 md:sticky md:top-0 xs:p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground xs:text-sm">
                  <span>Developer Docs</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                  <span>SAP HTTP API</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                  <span className="text-foreground">{endpoint.group}</span>
                </div>
                <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
                  <MethodBadge method={endpoint.method} />
                  <code className="truncate rounded-md bg-muted px-2 py-1 font-mono text-xs text-foreground">
                    {endpoint.path}
                  </code>
                </div>
              </div>
              <div className="flex flex-col gap-2 xs:flex-row xs:flex-wrap xs:items-center">
                <CopyButton value={markdown} label="Copy Markdown" />
                <Button asChild variant="outline" size="sm">
                  <Link href={requestPath} target="_blank">
                    Open <ArrowRight data-icon="inline-end" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>

          <div className="grid min-w-0 gap-6 p-3 xs:p-4 md:p-6 xl:p-8 2xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.78fr)]">
            <main className="min-w-0">
              <div className="xl:hidden">
                <Label className="text-xs text-muted-foreground">Endpoint</Label>
                <Select value={selectedKey} onValueChange={selectEndpoint}>
                  <SelectTrigger className="mt-2 h-auto min-h-11">
                    <SelectValue placeholder="Select endpoint" />
                  </SelectTrigger>
                  <SelectContent className="max-h-96">
                    {endpoints.map((item) => (
                      <SelectItem key={endpointKey(item)} value={endpointKey(item)}>
                        {item.method} {item.path}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <section id={endpointAnchor(endpoint)} className="mt-6 scroll-mt-28 xl:mt-0">
                <h1 className="text-md font-semibold tracking-tight text-foreground">
                  {endpointTitle(endpoint)}
                </h1>
                <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
                  {endpoint.summary} This endpoint returns {endpoint.response} from
                  Synapse Explorer&apos;s indexed SAP data and safe RPC refresh paths.
                </p>
                <div className="mt-4 rounded-xl border-l-4 border-primary/30 bg-muted/40 p-3 xs:p-4">
                  <p className="text-sm leading-6 text-foreground">
                    Use these HTTP endpoints to build SAP-native dashboards, agent
                    discovery flows, x402 commerce surfaces, vault memory views, and
                    oracle experiences without reimplementing the indexer.
                  </p>
                </div>
              </section>

              <section className="mt-8 md:mt-12">
                <h2 className="text-md font-semibold text-foreground">Endpoint HTTP</h2>
                <div className="mt-5 rounded-xl border bg-background p-4">
                  <p className="text-md text-muted-foreground">Base URL</p>
                  <code className="mt-2 block break-all rounded-lg bg-muted p-4 font-mono text-md text-foreground">
                    http://localhost:3000
                  </code>
                  <p className="mt-4 text-md text-muted-foreground">Resolved request</p>
                  <Link
                    href={requestPath}
                    target="_blank"
                    className="mt-2 flex items-start justify-between gap-3 rounded-lg bg-muted p-4 font-mono text-md text-foreground transition-colors hover:bg-accent hover:text-primary"
                  >
                    <code className="min-w-0 break-all">{requestPath}</code>
                    <ExternalLink className="mt-1 size-4 shrink-0" aria-hidden="true" />
                  </Link>
                  <p className="mt-4 text-md text-muted-foreground">Method</p>
                  <code className="mt-2 block break-all rounded-lg bg-muted p-4 font-mono text-md text-foreground">
                    {endpoint.method}
                  </code>
                </div>
              </section>

              <section className="mt-8 md:mt-12">
                <h2 className="text-md font-semibold text-foreground">params</h2>
                <div className="mt-5 flex flex-col gap-3">
                  {endpoint.paramsSpec.length > 0 ? (
                    <>
                      {requiredParams.map(renderParam)}
                      {optionalParams.map(renderParam)}
                    </>
                  ) : (
                    <div className="rounded-xl border bg-background p-5">
                      <p className="text-md font-medium text-foreground">
                        No parameters required
                      </p>
                      <p className="mt-2 text-md leading-7 text-muted-foreground">
                        This method can be called directly. Use the code panel to
                        execute the request or copy a client snippet.
                      </p>
                    </div>
                  )}
                </div>
              </section>

              <section className="mt-8 md:mt-12">
                <h2 className="text-md font-semibold text-foreground">result</h2>
                <div className="mt-5 flex flex-col gap-3">
                  {endpoint.schemaFields.map((field) => (
                    <div key={`${field.path}-${field.type}`} className="rounded-xl border bg-background p-4">
                      <div className="flex flex-col gap-3 xs:flex-row xs:items-start xs:justify-between">
                        <TypeInline type={field.type} onOpenType={setSelectedReference} />
                        <Link
                          href={`${requestPath}#${encodeURIComponent(field.path)}`}
                          target="_blank"
                          className="inline-flex max-w-full shrink-0 font-mono text-md text-foreground transition-colors hover:text-primary xs:max-w-[62%]"
                        >
                          <code className="truncate">{field.path}</code>
                        </Link>
                      </div>
                      <p className="mt-2 text-md leading-7 text-muted-foreground">
                        {field.description}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="mt-8 md:mt-12">
                <h2 className="text-md font-semibold text-foreground">Example shape</h2>
                <div className="mt-5">
                  <CodeBlock value={formatJson(endpoint.schemaExample)} />
                </div>
              </section>
            </main>

            <aside className="min-w-0 2xl:sticky 2xl:top-24 2xl:self-start">
              <Card className="overflow-hidden rounded-2xl border bg-card">
                <CardHeader className="border-b bg-muted/20">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Terminal className="text-primary" />
                        Request
                      </CardTitle>
                      <CardDescription className="mt-1">
                        Code examples generated from the selected inputs.
                      </CardDescription>
                    </div>
                    <CopyButton value={samples.curl} label="Copy" />
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <Tabs defaultValue="curl">
                    <TabsList className="w-full justify-start rounded-none border-b bg-muted/30 p-0">
                      <TabsTrigger value="curl" className="rounded-none">cURL</TabsTrigger>
                      <TabsTrigger value="typescript" className="rounded-none">TS fetch</TabsTrigger>
                      <TabsTrigger value="python" className="rounded-none">Python</TabsTrigger>
                      <TabsTrigger value="node" className="rounded-none">Node</TabsTrigger>
                    </TabsList>
                    {Object.entries(samples).map(([language, sample]) => (
                      <TabsContent key={language} value={language} className="m-0">
                        <pre className="max-h-[360px] overflow-auto bg-background p-5 font-mono text-xs leading-6 text-foreground">
                          {sample}
                        </pre>
                      </TabsContent>
                    ))}
                  </Tabs>
                  <div className="border-t bg-muted/20 p-4">
                    <Button onClick={runRequest} disabled={running} className="w-full">
                      {running ? (
                        <Loader2 data-icon="inline-start" className="animate-spin" />
                      ) : (
                        <Play data-icon="inline-start" />
                      )}
                      Try it
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="mt-4 overflow-hidden rounded-2xl border bg-card">
                <CardHeader className="border-b bg-muted/20">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <FileJson2 className="text-primary" />
                      Response
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={response?.ok ? "default" : error ? "destructive" : "outline"}
                      >
                        {response?.fromCache
                          ? "cached"
                          : response
                            ? `${response.status}`
                            : error
                              ? "error"
                              : "idle"}
                      </Badge>
                      {response && <Badge variant="outline">{response.durationMs}ms</Badge>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <pre className="max-h-[380px] overflow-auto bg-background p-5 font-mono text-xs leading-6 text-foreground">
                    {error ??
                      response?.body ??
                      "Run Try it to inspect the live JSON response."}
                  </pre>
                  <div className="border-t p-3">
                    <CopyButton value={response?.body ?? ""} />
                  </div>
                </CardContent>
              </Card>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DeveloperDocsPage() {
  const playgroundEndpoints = useMemo(() => buildPlaygroundEndpoints(), []);

  return (
    <div className="mx-auto w-full max-w-[1760px]">
      <ApiDocsConsole endpoints={playgroundEndpoints} />
    </div>
  );
}
