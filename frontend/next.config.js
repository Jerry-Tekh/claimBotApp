/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for Docker deployment
  output: process.env.DOCKER_BUILD === "true" ? "standalone" : undefined,

  // Env vars exposed to the browser
  env: {
    NEXT_PUBLIC_API_URL:              process.env.NEXT_PUBLIC_API_URL              || "http://localhost:4000",
    NEXT_PUBLIC_GENLAYER_ENDPOINT:    process.env.NEXT_PUBLIC_GENLAYER_ENDPOINT    || "https://testnet.genlayer.com",
    NEXT_PUBLIC_CONTRACT_ADDRESS:     process.env.NEXT_PUBLIC_CONTRACT_ADDRESS     || "0x0000000000000000000000000000000000000000",
  },

  // Next.js 15: turbopack is stable, opt-in
  // experimental: { turbopack: true },   // uncomment to use Turbopack in dev

  // Suppress hydration warnings from browser extensions
  reactStrictMode: true,

  // Fix workspace root detection warning in monorepo
  outputFileTracingRoot: require("path").join(__dirname, "../../"),
};

module.exports = nextConfig;
