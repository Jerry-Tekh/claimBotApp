#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const backendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(backendRoot, "..", "..");
const frontendRoot = path.join(repoRoot, "frontend", "src");
const filesToScan = [
  "services/bradburyClient.js",
  "services/bradburyTransactions.js",
  "services/genlayer.js",
  "routes/policies.js",
  "routes/claims.js",
].map(file => path.join(backendRoot, file));

const forbiddenPatterns = [
  { pattern: /gen_sendTransaction/, reason: "unsigned GenLayer RPC transaction call" },
  { pattern: /\brpcCall\s*\(/, reason: "legacy raw RPC helper" },
  { pattern: /ADMIN_WALLET/, reason: "legacy admin wallet sender configuration" },
  { pattern: /from:\s*wallet/, reason: "browser wallet passed as backend transaction sender" },
  { pattern: /return\s+DEMO_MODE\s*\?\s*wallet\s*:\s*getSignerAddress\(\)/, reason: "live reads mapped to backend signer instead of user wallet" },
];

const requiredChecks = [
  {
    file: path.join(frontendRoot, "services/genlayerWallet.ts"),
    pattern: /provider/,
    reason: "browser wallet provider must be used for Bradbury writes",
  },
  {
    file: path.join(frontendRoot, "services/genlayerWallet.ts"),
    pattern: /wallet_switchEthereumChain/,
    reason: "browser wallet flow must switch users to Bradbury",
  },
  {
    file: path.join(frontendRoot, "services/genlayerWallet.ts"),
    pattern: /purchase_policy[\s\S]*file_claim[\s\S]*appeal_claim/,
    reason: "browser wallet service must submit policy, claim, and appeal contract calls",
  },
  {
    file: path.join(frontendRoot, "components/dashboard/PoliciesTab.tsx"),
    patterns: [/purchasePolicyWithWallet/, /recordPolicyPurchase/, /cancelPolicyWithWallet/, /recordPolicyCancel/],
    reason: "policy UI must approve in wallet before recording backend state",
  },
  {
    file: path.join(frontendRoot, "components/dashboard/FileClaimTab.tsx"),
    pattern: /submitClaimWithWallet[\s\S]*recordClaimSubmission/,
    reason: "claim UI must approve in wallet before recording backend state",
  },
  {
    file: path.join(frontendRoot, "components/dashboard/ClaimRow.tsx"),
    pattern: /submitAppealWithWallet[\s\S]*recordClaimAppeal/,
    reason: "appeal UI must approve in wallet before recording backend state",
  },
  {
    file: path.join(backendRoot, "routes/policies.js"),
    patterns: [/record-purchase/, /record-cancel/, /Live policy purchases must be approved in the browser wallet/],
    reason: "backend policy routes must record client-signed transactions and reject live legacy writes",
  },
  {
    file: path.join(backendRoot, "routes/claims.js"),
    patterns: [/record-submit/, /record-appeal/, /Live claim submissions must be approved in the browser wallet/],
    reason: "backend claim routes must record client-signed transactions and reject live legacy writes",
  },
  {
    file: path.join(backendRoot, "services/genlayer.js"),
    pattern: /function getEffectiveWallet\(wallet\)\s*{\s*return wallet;\s*}/,
    reason: "live reads must use the connected user wallet",
  },
  {
    file: path.join(backendRoot, "services/bradburyClient.js"),
    pattern: /getOptionalPrivateKey/,
    reason: "backend reads must not require a private key",
  },
  {
    file: path.join(backendRoot, "services/bradburyTransactions.js"),
    pattern: /Missing PRIVATE_KEY or GENLAYER_PRIVATE_KEY for backend-signed Bradbury transaction/,
    reason: "legacy backend maintenance writes must fail clearly without a signer",
  },
];

const failures = [];

for (const file of filesToScan) {
  const source = fs.readFileSync(file, "utf8");
  for (const { pattern, reason } of forbiddenPatterns) {
    if (pattern.test(source)) {
      failures.push(`${path.relative(process.cwd(), file)} contains ${reason}`);
    }
  }
}

for (const { file, pattern, patterns, reason } of requiredChecks) {
  const source = fs.readFileSync(file, "utf8");
  const checks = patterns || [pattern];
  if (!checks.every(check => check.test(source))) {
    failures.push(`${path.relative(process.cwd(), file)} is missing required guard: ${reason}`);
  }
}

if (failures.length) {
  console.error("Bradbury browser-wallet production guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Bradbury browser-wallet production guard passed");
