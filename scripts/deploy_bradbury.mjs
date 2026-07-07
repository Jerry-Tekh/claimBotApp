#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { createAccount, createClient, abi } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { ExecutionResult, TransactionStatus } from "genlayer-js/types";
import { encodeFunctionData, parseEventLogs } from "viem";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const envPath = path.join(rootDir, "contracts", ".env.local");
const contractPath = path.join(rootDir, "contracts", "claimbot_main.py");
const outputPath = path.join(rootDir, ".env.bradbury");

dotenv.config({ path: envPath });

const endpoint = process.env.GENLAYER_ENDPOINT || testnetBradbury.rpcUrls.default.http[0];
const privateKey = process.env.GENLAYER_PRIVATE_KEY || process.env.PRIVATE_KEY;
const existingContractAddress = process.env.CONTRACT_ADDRESS || process.env.CLAIMBOT_CONTRACT_ADDRESS;

if (!privateKey) {
  throw new Error("Missing PRIVATE_KEY or GENLAYER_PRIVATE_KEY in contracts/.env.local");
}

if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
  throw new Error("PRIVATE_KEY must be a 0x-prefixed 32-byte hex private key");
}

const account = createAccount(privateKey);
const client = createClient({
  chain: testnetBradbury,
  endpoint,
  account,
});

function asJson(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function stableId(prefix) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `${prefix}-${stamp}`;
}

function defaultExpiryTimestamp() {
  return BigInt(Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function txSucceeded(receipt) {
  if (!receipt) return false;
  const resultName = receipt.txExecutionResultName;
  return (
    resultName === ExecutionResult.FINISHED_WITH_RETURN ||
    resultName === "FINISHED_WITH_RETURN"
  );
}

async function waitAccepted(hash, label, retries = 90) {
  console.log(`${label} tx: ${hash}`);
  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
    interval: 5_000,
    retries,
  });
  console.log(`${label} receipt status: ${receipt.statusName ?? receipt.status ?? "unknown"}`);
  if (!txSucceeded(receipt)) {
    console.log(JSON.stringify(receipt, (_, value) => typeof value === "bigint" ? value.toString() : value, 2));
    throw new Error(`${label} did not finish successfully`);
  }
  return receipt;
}

async function read(address, functionName, args = []) {
  const value = await client.readContract({
    address,
    functionName,
    args,
    jsonSafeReturn: true,
  });
  return asJson(value);
}

async function write(address, functionName, args = [], value = 0n, label = functionName) {
  const hash = await sendWriteWithGasBuffer(address, functionName, args, value);
  return waitAccepted(hash, label);
}

async function waitEvmReceipt(hash, retries = 120) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const receipt = await client.request({
      method: "eth_getTransactionReceipt",
      params: [hash],
    });
    if (receipt) return receipt;
    await sleep(2_000);
  }
  throw new Error(`Timed out waiting for EVM transaction receipt: ${hash}`);
}

function addTransactionInputCount() {
  const item = testnetBradbury.consensusMainContract.abi.find(
    (entry) => entry?.type === "function" && entry.name === "addTransaction"
  );
  return Array.isArray(item?.inputs) ? item.inputs.length : 0;
}

function extractTxIdFromLogs(logs) {
  const events = parseEventLogs({
    abi: testnetBradbury.consensusMainContract.abi,
    eventName: "NewTransaction",
    logs,
  });
  return events[0]?.args?.txId;
}

async function sendWriteWithGasBuffer(address, functionName, args = [], value = 0n) {
  const callData = abi.calldata.encode(
    abi.calldata.makeCalldataObject(functionName, args, undefined)
  );
  const txData = abi.transactions.serialize([callData, false]);
  const addArgs = [
    account.address,
    address,
    testnetBradbury.defaultNumberOfInitialValidators,
    testnetBradbury.defaultConsensusMaxRotations,
    txData,
  ];
  if (addTransactionInputCount() >= 6) {
    addArgs.push(BigInt(Math.floor(Date.now() / 1000) + 3600));
  }

  const encodedData = encodeFunctionData({
    abi: testnetBradbury.consensusMainContract.abi,
    functionName: "addTransaction",
    args: addArgs,
  });

  const nonce = await client.getCurrentNonce({ address: account.address });
  const gasPriceHex = await client.request({ method: "eth_gasPrice" });
  const estimatedGasHex = await client.request({
    method: "eth_estimateGas",
    params: [{
      from: account.address,
      to: testnetBradbury.consensusMainContract.address,
      data: encodedData,
      value: `0x${value.toString(16)}`,
    }],
  });
  const estimatedGas = BigInt(estimatedGasHex);
  const gas = (estimatedGas * 160n) / 100n + 50_000n;

  const serializedTransaction = await account.signTransaction({
    account,
    to: testnetBradbury.consensusMainContract.address,
    data: encodedData,
    type: "legacy",
    nonce: Number(nonce),
    value,
    gas,
    gasPrice: BigInt(gasPriceHex),
    chainId: testnetBradbury.id,
  });
  const evmHash = await client.sendRawTransaction({ serializedTransaction });
  const receipt = await waitEvmReceipt(evmHash);
  if (receipt.status === "0x0" || receipt.status === "reverted") {
    throw new Error(`EVM transaction reverted before GenLayer consensus tx creation: ${evmHash}`);
  }
  const txId = extractTxIdFromLogs(receipt.logs);
  if (!txId) {
    throw new Error(`EVM transaction succeeded but no GenLayer tx id was emitted: ${evmHash}`);
  }
  console.log(`${functionName} evm tx: ${evmHash}`);
  return txId;
}

async function deploy() {
  if (existingContractAddress) {
    console.log(`Using existing contract: ${existingContractAddress}`);
    return existingContractAddress;
  }

  const code = fs.readFileSync(contractPath);
  const schema = await client.getContractSchemaForCode(code.toString("utf8"));
  assert(schema.methods?.list_templates, "Schema is missing list_templates");
  assert(schema.methods?.purchase_policy, "Schema is missing purchase_policy");
  console.log(`Schema OK: ${Object.keys(schema.methods).length} public methods`);

  const hash = await client.deployContract({
    account,
    code,
    args: [],
    leaderOnly: false,
  });
  const receipt = await waitAccepted(hash, "deploy", 120);
  const address = receipt.data?.contract_address || receipt.txDataDecoded?.contractAddress;
  assert(address, "Deployment receipt did not include a contract address");

  fs.writeFileSync(
    outputPath,
    [
      "# ClaimBot Bradbury deployment",
      `# Deployed: ${new Date().toISOString()}`,
      `GENLAYER_ENDPOINT=${endpoint}`,
      `NEXT_PUBLIC_GENLAYER_ENDPOINT=${endpoint}`,
      `CONTRACT_ADDRESS=${address}`,
      `NEXT_PUBLIC_CONTRACT_ADDRESS=${address}`,
      "",
    ].join("\n")
  );
  console.log(`Contract address: ${address}`);
  console.log(`Deployment env written: ${outputPath}`);
  return address;
}

async function testContract(address) {
  const schema = await client.getContractSchema(address);
  assert(schema.methods?.get_treasury, "Deployed schema missing get_treasury");
  assert(schema.methods?.file_claim, "Deployed schema missing file_claim");
  console.log(`Deployed schema OK: ${Object.keys(schema.methods).length} public methods`);

  const templates = await read(address, "list_templates");
  assert(Array.isArray(templates), "list_templates did not return an array");
  assert(templates.some((template) => template.id === "flood-ng"), "flood-ng template missing");
  console.log(`list_templates OK: ${templates.length} templates`);

  const treasuryBefore = await read(address, "get_treasury");
  assert(treasuryBefore && typeof treasuryBefore === "object", "get_treasury did not return an object");
  console.log(`get_treasury OK: pool=${treasuryBefore.pool_balance ?? treasuryBefore.pool ?? "unknown"}`);

  const policyId = stableId("POL-BRADBURY");
  const claimId = stableId("CLM-BRADBURY");
  const coverageAmount = 1_000_000_000n;
  const premium = 20_000_000n;
  const expiryBlock = defaultExpiryTimestamp();

  await write(
    address,
    "purchase_policy",
    [
      policyId,
      "flood-ng",
      "Lagos State, Nigeria",
      coverageAmount,
      expiryBlock,
      "Flooding that displaces more than 500 residents in Lagos State, Nigeria",
    ],
    premium,
    "purchase_policy"
  );

  const policy = await read(address, "get_policy", [policyId]);
  assert(policy?.policy_id === policyId, "get_policy returned the wrong policy");
  assert(policy.active === true, "Purchased policy is not active");
  console.log(`get_policy OK: ${policyId}`);

  const walletPolicies = await read(address, "get_wallet_policies", [account.address]);
  assert(Array.isArray(walletPolicies), "get_wallet_policies did not return an array");
  assert(walletPolicies.some((entry) => entry.policy_id === policyId || entry === policyId), "wallet policy list missing purchased policy");
  console.log(`get_wallet_policies OK: ${walletPolicies.length} policies`);

  let claimable = await read(address, "is_claimable", [policyId]);
  assert(claimable && typeof claimable === "object", "is_claimable did not return an object");
  console.log(`is_claimable OK: claimable=${claimable.claimable}`);

  if (claimable.claimable !== true && String(claimable.reason || "").includes("Cooling-off")) {
    console.log("Waiting 60 seconds for cooling-off window before file_claim...");
    await sleep(60_000);
    claimable = await read(address, "is_claimable", [policyId]);
    console.log(`is_claimable after wait: claimable=${claimable.claimable}`);
  }

  if (claimable.claimable === true) {
    await write(
      address,
      "file_claim",
      [
        claimId,
        policyId,
        "Bradbury smoke test flood claim for Lagos State with trusted evidence URLs.",
        JSON.stringify([
          "https://nihsa.gov.ng",
          "https://channelstv.com",
          "https://open-meteo.com",
        ]),
      ],
      0n,
      "file_claim"
    );

    const claim = await read(address, "get_claim", [claimId]);
    assert(claim?.claim_id === claimId, "get_claim returned the wrong claim");
    console.log(`get_claim OK: status=${claim.status}, score=${claim.evidence_score}`);

    const walletClaims = await read(address, "get_wallet_claims", [account.address]);
    assert(Array.isArray(walletClaims), "get_wallet_claims did not return an array");
    assert(walletClaims.some((entry) => entry.claim_id === claimId), "wallet claims missing filed claim");
    console.log(`get_wallet_claims OK: ${walletClaims.length} claims`);
  } else {
    throw new Error(`Policy was not claimable after cooling-off wait: ${claimable.reason || "unknown reason"}`);
  }

  const stats = await read(address, "get_global_stats");
  assert(stats && typeof stats === "object", "get_global_stats did not return an object");
  console.log(`get_global_stats OK: total_policies=${stats.total_policies}`);

  console.log("Bradbury contract smoke test complete");
}

async function main() {
  console.log(`Bradbury RPC: ${endpoint}`);
  console.log(`Deployer: ${account.address}`);
  const address = await deploy();
  await testContract(address);
  console.log(`Explorer: ${testnetBradbury.blockExplorers.default.url}address/${address}`);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
