"use client";

import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import type { Address } from "genlayer-js/types";
import { getEthereumProvider, isWalletAddress, normalizeWalletAddress, type EthereumProvider } from "./wallet";

const DEFAULT_CONTRACT_ADDRESS = "0x5c5C18e0B7bD4EfF63C89C7077DAA64f2F4356d1";
const BRADBURY_CHAIN_ID_HEX = `0x${testnetBradbury.id.toString(16)}`;

const TEMPLATE_PREMIUM_BPS: Record<string, number> = {
  "flood-ng": 200,
  "crop-failure": 300,
  "flight-delay": 150,
  "port-strike": 250,
};

type WalletWriteResult = {
  tx_hash: string;
  confirmation_status: "submitted";
};

export type PolicyPurchaseResult = WalletWriteResult & {
  policy_id: string;
  premium_paid: number;
  trigger_condition: string;
};

export type ClaimSubmissionResult = WalletWriteResult & {
  claim_id: string;
  status: "pending";
  evidence_score?: number;
};

export type AppealSubmissionResult = WalletWriteResult & {
  claim_id: string;
  appeal_round: number;
  approved: false;
  score: number;
  reasoning: string;
};

function getContractAddress(): Address {
  const address = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || DEFAULT_CONTRACT_ADDRESS;
  if (!isWalletAddress(address)) {
    throw new Error("NEXT_PUBLIC_CONTRACT_ADDRESS must be a valid 0x contract address.");
  }
  return address as Address;
}

function getEndpoint(): string | undefined {
  return process.env.NEXT_PUBLIC_GENLAYER_ENDPOINT || undefined;
}

function requireProvider(): EthereumProvider {
  const provider = getEthereumProvider();
  if (!provider) {
    throw new Error("No browser wallet found. Install MetaMask or another EVM wallet.");
  }
  return provider;
}

async function getActiveWallet(provider: EthereumProvider): Promise<string> {
  const accounts = await provider.request<string[]>({ method: "eth_requestAccounts" });
  const account = normalizeWalletAddress(accounts?.[0]);
  if (!isWalletAddress(account)) {
    throw new Error("Wallet did not return a valid address.");
  }
  return account;
}

async function assertWalletMatches(provider: EthereumProvider, expectedWallet: string): Promise<string> {
  const activeWallet = await getActiveWallet(provider);
  if (activeWallet.toLowerCase() !== expectedWallet.toLowerCase()) {
    throw new Error(`Connected wallet ${activeWallet} does not match selected wallet ${expectedWallet}.`);
  }
  return activeWallet;
}

async function ensureBradburyNetwork(provider: EthereumProvider) {
  const chainId = await provider.request<string>({ method: "eth_chainId" }).catch(() => "");
  if (chainId?.toLowerCase() === BRADBURY_CHAIN_ID_HEX) return;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BRADBURY_CHAIN_ID_HEX }],
    });
    return;
  } catch (error: unknown) {
    const code = typeof error === "object" && error && "code" in error ? Number(error.code) : 0;
    if (code !== 4902) throw error;
  }

  const rpcUrl = testnetBradbury.rpcUrls.default.http[0];
  const explorerUrl = testnetBradbury.blockExplorers?.default?.url;
  await provider.request({
    method: "wallet_addEthereumChain",
    params: [{
      chainId: BRADBURY_CHAIN_ID_HEX,
      chainName: testnetBradbury.name,
      nativeCurrency: testnetBradbury.nativeCurrency,
      rpcUrls: [rpcUrl],
      blockExplorerUrls: explorerUrl ? [explorerUrl] : [],
    }],
  });
}

function createWalletClient(provider: EthereumProvider, account: string) {
  return createClient({
    chain: testnetBradbury,
    endpoint: getEndpoint(),
    account: account as Address,
    provider,
  });
}

function buildTriggerOverride(templateId: string, coverageArea: string, triggerOverrides: Record<string, string> = {}) {
  const area = triggerOverrides.area || coverageArea;
  switch (templateId) {
    case "flood-ng":
      return `Flooding that displaces more than ${triggerOverrides.threshold || "5000"} residents in ${area}`;
    case "crop-failure":
      return `NDVI index below ${triggerOverrides.ndvi_threshold || "0.3"} in ${area} for ${triggerOverrides.consecutive_weeks || "3"} consecutive weeks`;
    case "flight-delay":
      return `Flight ${triggerOverrides.flight_number || "specified flight"} delayed more than ${triggerOverrides.delay_hours || "3"} hours on ${triggerOverrides.date || "the covered date"}`;
    case "port-strike":
      return `Official port strike at ${triggerOverrides.port_name || area} lasting more than ${triggerOverrides.duration_hours || "24"} hours`;
    default:
      return triggerOverrides.trigger || `Covered event in ${area}`;
  }
}

async function shortHash(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16)
    .toUpperCase();
}

function entropy() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}:${Math.random()}`;
}

async function makePolicyId(wallet: string, templateId: string, coverageArea: string) {
  return `POL-${await shortHash(`${wallet}:${templateId}:${coverageArea}:${entropy()}`)}`;
}

async function makeClaimId(wallet: string, policyId: string) {
  return `CLM-${await shortHash(`${policyId}:${wallet}:${entropy()}`)}`;
}

function normalizeTxHash(result: unknown): string {
  if (typeof result === "string" && result.startsWith("0x")) return result;
  if (typeof result === "object" && result) {
    const value = result as Record<string, unknown>;
    const hash = value.tx_hash || value.hash || value.transactionHash || value.txHash;
    if (typeof hash === "string" && hash.startsWith("0x")) return hash;
  }
  throw new Error("Wallet transaction completed but no GenLayer transaction hash was returned.");
}

export function getWalletErrorMessage(error: unknown): string {
  if (typeof error === "object" && error && "code" in error && Number(error.code) === 4001) {
    return "Transaction rejected in wallet.";
  }
  return error instanceof Error ? error.message : String(error);
}

export async function purchasePolicyWithWallet(params: {
  wallet: string;
  templateId: string;
  coverageArea: string;
  coverageAmount: number;
  expiryBlock: number;
  triggerOverrides?: Record<string, string>;
}): Promise<PolicyPurchaseResult> {
  const provider = requireProvider();
  const account = await assertWalletMatches(provider, params.wallet);
  await ensureBradburyNetwork(provider);

  const client = createWalletClient(provider, account);
  const policyId = await makePolicyId(account, params.templateId, params.coverageArea);
  const premiumPaid = Math.round((params.coverageAmount * (TEMPLATE_PREMIUM_BPS[params.templateId] || 200)) / 10_000);
  const triggerCondition = buildTriggerOverride(params.templateId, params.coverageArea, params.triggerOverrides);

  const txHash = normalizeTxHash(await client.writeContract({
    address: getContractAddress(),
    functionName: "purchase_policy",
    args: [
      policyId,
      params.templateId,
      params.coverageArea,
      params.coverageAmount,
      params.expiryBlock,
      triggerCondition,
    ],
    value: BigInt(premiumPaid),
  }));

  return {
    policy_id: policyId,
    premium_paid: premiumPaid,
    trigger_condition: triggerCondition,
    tx_hash: txHash,
    confirmation_status: "submitted",
  };
}

export async function cancelPolicyWithWallet(params: {
  wallet: string;
  policyId: string;
}): Promise<WalletWriteResult> {
  const provider = requireProvider();
  const account = await assertWalletMatches(provider, params.wallet);
  await ensureBradburyNetwork(provider);

  const client = createWalletClient(provider, account);
  const txHash = normalizeTxHash(await client.writeContract({
    address: getContractAddress(),
    functionName: "cancel_policy",
    args: [params.policyId],
    value: BigInt(0),
  }));

  return { tx_hash: txHash, confirmation_status: "submitted" };
}

export async function submitClaimWithWallet(params: {
  wallet: string;
  policyId: string;
  eventDescription: string;
  sourceUrls: string[];
  evidenceScore?: number;
}): Promise<ClaimSubmissionResult> {
  const provider = requireProvider();
  const account = await assertWalletMatches(provider, params.wallet);
  await ensureBradburyNetwork(provider);

  const client = createWalletClient(provider, account);
  const claimId = await makeClaimId(account, params.policyId);
  const txHash = normalizeTxHash(await client.writeContract({
    address: getContractAddress(),
    functionName: "file_claim",
    args: [
      claimId,
      params.policyId,
      params.eventDescription,
      JSON.stringify(params.sourceUrls),
    ],
    value: BigInt(0),
  }));

  return {
    claim_id: claimId,
    tx_hash: txHash,
    status: "pending",
    evidence_score: params.evidenceScore,
    confirmation_status: "submitted",
  };
}

export async function submitAppealWithWallet(params: {
  wallet: string;
  claimId: string;
  additionalSources: string[];
  appealStatement: string;
  appealRound?: number;
}): Promise<AppealSubmissionResult> {
  const provider = requireProvider();
  const account = await assertWalletMatches(provider, params.wallet);
  await ensureBradburyNetwork(provider);

  const client = createWalletClient(provider, account);
  const txHash = normalizeTxHash(await client.writeContract({
    address: getContractAddress(),
    functionName: "appeal_claim",
    args: [
      params.claimId,
      JSON.stringify(params.additionalSources),
      params.appealStatement,
    ],
    value: BigInt(0),
  }));

  return {
    claim_id: params.claimId,
    tx_hash: txHash,
    confirmation_status: "submitted",
    appeal_round: params.appealRound ?? 1,
    approved: false,
    score: 0,
    reasoning: "Processing",
  };
}
