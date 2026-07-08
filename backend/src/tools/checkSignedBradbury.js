#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const backendRoot = path.resolve(__dirname, "..");
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
];

const requiredChecks = [
  {
    file: path.join(backendRoot, "services/bradburyTransactions.js"),
    pattern: /account\.signTransaction/,
    reason: "Bradbury writes must sign raw transactions with the backend account",
  },
  {
    file: path.join(backendRoot, "services/bradburyTransactions.js"),
    pattern: /sendRawTransaction/,
    reason: "Signed Bradbury writes must submit serialized transactions",
  },
  {
    file: path.join(backendRoot, "services/genlayer.js"),
    pattern: /sendSignedWrite/,
    reason: "Live GenLayer writes must use the signed Bradbury helper",
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

for (const { file, pattern, reason } of requiredChecks) {
  const source = fs.readFileSync(file, "utf8");
  if (!pattern.test(source)) {
    failures.push(`${path.relative(process.cwd(), file)} is missing required guard: ${reason}`);
  }
}

if (failures.length) {
  console.error("Signed Bradbury backend guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Signed Bradbury backend guard passed");
