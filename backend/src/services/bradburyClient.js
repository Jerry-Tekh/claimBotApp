// backend/src/services/bradburyClient.js
// Lazy GenLayer Bradbury SDK client for production contract reads/writes.

const { createAccount, createClient, abi } = require("genlayer-js");
const { testnetBradbury } = require("genlayer-js/chains");
const { ExecutionResult, TransactionStatus } = require("genlayer-js/types");
const { encodeFunctionData, parseEventLogs } = require("viem");

const DEFAULT_ENDPOINT = testnetBradbury.rpcUrls.default.http[0];
let cached;

function getPrivateKey() {
  const privateKey = process.env.GENLAYER_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("Missing PRIVATE_KEY or GENLAYER_PRIVATE_KEY for live Bradbury transactions");
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error("PRIVATE_KEY must be a 0x-prefixed 32-byte hex private key");
  }
  return privateKey;
}

function isValidPrivateKey(privateKey) {
  return /^0x[0-9a-fA-F]{64}$/.test(privateKey || "");
}

function isValidAddress(address) {
  return /^0x[0-9a-fA-F]{40}$/.test(address || "");
}

function getContractAddress() {
  const address = process.env.CONTRACT_ADDRESS || process.env.CLAIMBOT_CONTRACT_ADDRESS;
  if (!isValidAddress(address)) {
    throw new Error("CONTRACT_ADDRESS must be a 0x-prefixed contract address");
  }
  return address;
}

function getBradburyConfigStatus() {
  const privateKey = process.env.GENLAYER_PRIVATE_KEY || process.env.PRIVATE_KEY;
  const contractAddress = process.env.CONTRACT_ADDRESS || process.env.CLAIMBOT_CONTRACT_ADDRESS;
  const signerConfigured = isValidPrivateKey(privateKey);

  return {
    endpoint: process.env.GENLAYER_ENDPOINT || DEFAULT_ENDPOINT,
    contractAddress: isValidAddress(contractAddress) ? contractAddress : null,
    contractConfigured: isValidAddress(contractAddress),
    signerConfigured,
    signerAddress: signerConfigured ? createAccount(privateKey).address : null,
  };
}

function getBradburyContext() {
  if (cached) return cached;

  const account = createAccount(getPrivateKey());
  const endpoint = process.env.GENLAYER_ENDPOINT || DEFAULT_ENDPOINT;
  const client = createClient({
    chain: testnetBradbury,
    endpoint,
    account,
  });

  cached = {
    abi,
    account,
    client,
    contractAddress: getContractAddress(),
    encodeFunctionData,
    endpoint,
    ExecutionResult,
    parseEventLogs,
    testnetBradbury,
    TransactionStatus,
  };
  return cached;
}

function getSignerAddress() {
  return getBradburyContext().account.address;
}

module.exports = {
  DEFAULT_ENDPOINT,
  getBradburyContext,
  getBradburyConfigStatus,
  getSignerAddress,
};
