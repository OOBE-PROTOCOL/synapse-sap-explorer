import assert from 'node:assert/strict';
import { asPublicKeyText, asText, entityPath, pathSegment, short } from '../src/lib/format';
import { safeExternalUrl } from '../src/lib/safe-url';
import { dbToolToApi, apiToolToDb } from '../src/lib/db/mappers';

const decimalPublicKey = {
  _bn: '64066568018587893279990577446704830213953063974720276571754091611034192337697',
};

assert.equal(
  asPublicKeyText(decimalPublicKey),
  'AXuskFXQsDFAMPq1hXkfGTVMss16uXj4jspCM2xS4uKN',
  'decimal PublicKey JSON must normalize to base58',
);

assert.equal(
  pathSegment(JSON.stringify(decimalPublicKey)),
  'AXuskFXQsDFAMPq1hXkfGTVMss16uXj4jspCM2xS4uKN',
  'JSON-encoded PublicKey route segments must not leak encoded objects',
);

assert.equal(
  entityPath('/agents', decimalPublicKey),
  '/agents/AXuskFXQsDFAMPq1hXkfGTVMss16uXj4jspCM2xS4uKN',
  'entity paths must build clean dynamic hrefs',
);

assert.equal(
  short(decimalPublicKey, 6, 4),
  'AXuskF…4uKN',
  'address truncation must accept serialized PublicKey objects',
);

assert.equal(
  asText({ _bn: '12345' }),
  '{"_bn":"12345"}',
  'generic text formatting must not treat every BN object as a PublicKey',
);

assert.equal(
  safeExternalUrl('javascript:alert(1)'),
  null,
  'unsafe protocols must not be clickable',
);

assert.equal(
  safeExternalUrl('ipfs://bafybeigdyrzt'),
  'https://ipfs.io/ipfs/bafybeigdyrzt',
  'IPFS metadata links should be normalized to an HTTPS gateway',
);

const toolRow = dbToolToApi({
  pda: decimalPublicKey,
  agentPda: decimalPublicKey,
  bump: 1,
  toolName: 'inscribed-tool',
  protocolHash: null,
  version: 1,
  descriptionHash: null,
  inputSchemaHash: null,
  outputSchemaHash: null,
  httpMethod: 'GET',
  category: 'custom',
  paramsCount: 0,
  requiredParams: 0,
  isCompound: false,
  isActive: true,
  totalInvocations: '100',
  createdAt: new Date(0),
  updatedAt: new Date(0),
  previousVersion: null,
} as never);

assert.equal(
  toolRow.descriptor.agent,
  'AXuskFXQsDFAMPq1hXkfGTVMss16uXj4jspCM2xS4uKN',
  'DB tool agent PDA must normalize before UI joins',
);

assert.equal(
  apiToolToDb({ pda: decimalPublicKey, descriptor: { agent: decimalPublicKey } } as never).agentPda,
  'AXuskFXQsDFAMPq1hXkfGTVMss16uXj4jspCM2xS4uKN',
  'incoming tool descriptors must persist normalized agent PDA',
);

console.log('regression tests passed');
