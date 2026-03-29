import { docs } from '@/.source';

import { loader } from 'fumadocs-core/source';

// fumadocs-mdx v11 returns files as a lazy function, but fumadocs-core v15
// expects a plain array — resolve it before passing to loader()
const rawSource = docs.toFumadocsSource();
const files = typeof rawSource.files === 'function'
  ? (rawSource.files as CallableFunction)()
  : rawSource.files;

export const source = loader({
  baseUrl: '/docs',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  source: { files } as any,
});
