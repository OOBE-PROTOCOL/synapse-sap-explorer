import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: [
      '@oobe-protocol-labs/synapse-client-sdk',
      '@langchain/openai',
      '@langchain/core',
      'langchain',
    ],
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

    return config;
  },
};

export default nextConfig;
