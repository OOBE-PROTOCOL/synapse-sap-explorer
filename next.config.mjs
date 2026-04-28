import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createMDX } from 'fumadocs-mdx/next';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Next 15: serverComponentsExternalPackages moved out of experimental
  serverExternalPackages: [
    '@oobe-protocol-labs/synapse-client-sdk',
    '@oobe-protocol-labs/synapse-sap-sdk',
    '@triton-one/yellowstone-grpc',
    '@langchain/openai',
    '@langchain/core',
    'langchain',
  ],
  // Cache prefetched RSC payloads aggressively so transitions between the app
  // shell and the /docs segment feel instantaneous on repeat hovers/clicks.
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
    optimisticClientCache: true,
  },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  webpack: (config, { isServer }) => {
    // Project path alias: ~ → ./src
    config.resolve.alias = {
      ...config.resolve.alias,
      '~': resolve(__dirname, 'src'),
    };

    // @solana/web3.js needs Node builtins disabled in browser
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
      };
    }

    // Silence optional `pino-pretty` import pulled in transitively by
    // @walletconnect/logger → pino. We never want pretty logs in the browser
    // bundle, so resolve it to false on both sides.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      'pino-pretty': false,
    };

    return config;
  },
};

const withMDX = createMDX();

export default withMDX(nextConfig);
