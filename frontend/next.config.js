/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for Docker deployment
  output: process.env.DOCKER_BUILD === "true" ? "standalone" : undefined,

  // Env vars exposed to the browser
  env: {
    NEXT_PUBLIC_API_URL:              process.env.NEXT_PUBLIC_API_URL              || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000",
    NEXT_PUBLIC_API_BASE_URL:         process.env.NEXT_PUBLIC_API_BASE_URL         || process.env.NEXT_PUBLIC_API_URL      || "http://localhost:4000",
    NEXT_PUBLIC_GENLAYER_ENDPOINT:    process.env.NEXT_PUBLIC_GENLAYER_ENDPOINT    || "https://rpc-bradbury.genlayer.com",
    NEXT_PUBLIC_CONTRACT_ADDRESS:     process.env.NEXT_PUBLIC_CONTRACT_ADDRESS     || "0x5c5C18e0B7bD4EfF63C89C7077DAA64f2F4356d1",
  },

  // Next.js 15: turbopack is stable, opt-in
  // experimental: { turbopack: true },   // uncomment to use Turbopack in dev

  // Suppress hydration warnings from browser extensions
  reactStrictMode: true,

  // Trace files from the repository root when the frontend is deployed from a monorepo.
  outputFileTracingRoot: require("path").join(__dirname, "../"),
};

module.exports = nextConfig;
