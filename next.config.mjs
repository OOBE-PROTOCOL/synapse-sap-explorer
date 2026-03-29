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
    '@langchain/openai',
    '@langchain/core',
    'langchain',
  ],
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

    return config;
  },
};

const withMDX = createMDX();

export default withMDX(nextConfig);
