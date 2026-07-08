// backend/src/services/bradburyTransactions.js
// Signed GenLayer Bradbury contract read/write helpers.

const { getBradburyContext } = require("./bradburyClient");

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function asJson(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function toBigInt(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  if (typeof value === "string" && value.trim()) return BigInt(value);
  return 0n;
}

function txSucceeded(receipt, ExecutionResult) {
  if (!receipt) return false;
  const resultName = receipt.txExecutionResultName;
  return (
    resultName === ExecutionResult.FINISHED_WITH_RETURN ||
    resultName === "FINISHED_WITH_RETURN"
  );
}

async function readContract(functionName, args = []) {
  const { client, contractAddress } = getBradburyContext();
  const value = await client.readContract({
    address: contractAddress,
    functionName,
    args,
    jsonSafeReturn: true,
  });
  return asJson(value);
}

async function waitAccepted(hash, label, retries = 90) {
  const { client, ExecutionResult, TransactionStatus } = getBradburyContext();
  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
    interval: 5_000,
    retries,
  });

  if (!txSucceeded(receipt, ExecutionResult)) {
    throw new Error(`${label} did not finish successfully: ${receipt.txExecutionResultName || receipt.statusName || receipt.status || "unknown"}`);
  }
  return receipt;
}

async function waitAcceptedIfRequested(hash, label, shouldWait) {
  if (!shouldWait) return null;
  return waitAccepted(hash, label);
}

async function waitEvmReceipt(hash, retries = 120) {
  const { client } = getBradburyContext();
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
  const { testnetBradbury } = getBradburyContext();
  const item = testnetBradbury.consensusMainContract.abi.find(
    entry => entry?.type === "function" && entry.name === "addTransaction"
  );
  return Array.isArray(item?.inputs) ? item.inputs.length : 0;
}

const TX_ID_EVENT_NAMES = ["NewTransaction", "CreatedTransaction"];

function isBytes32(value) {
  return /^0x[0-9a-fA-F]{64}$/.test(value || "");
}

function eventSignature(event) {
  return `${event.name}(${event.inputs.map(input => input.type).join(",")})`;
}

function txIdEventTopics() {
  const { testnetBradbury, toEventSelector } = getBradburyContext();
  return new Set(
    testnetBradbury.consensusMainContract.abi
      .filter(entry => entry.type === "event" && TX_ID_EVENT_NAMES.includes(entry.name))
      .map(entry => toEventSelector(eventSignature(entry)).toLowerCase())
  );
}

function extractTxIdFromLogs(logs) {
  const { parseEventLogs, testnetBradbury } = getBradburyContext();
  for (const eventName of TX_ID_EVENT_NAMES) {
    try {
      const events = parseEventLogs({
        abi: testnetBradbury.consensusMainContract.abi,
        eventName,
        logs,
        strict: false,
      });
      const txId = events.find(event => isBytes32(event.args?.txId))?.args?.txId;
      if (txId) return txId;
    } catch {
      // Fall through to topic extraction below.
    }
  }

  const topics = txIdEventTopics();
  const txLog = (logs || []).find(log =>
    topics.has(String(log.topics?.[0] || "").toLowerCase()) &&
    isBytes32(log.topics?.[1])
  );
  return txLog?.topics?.[1];
}

async function sendSignedWrite(functionName, args = [], value = 0n, options = {}) {
  const {
    abi,
    account,
    client,
    contractAddress,
    encodeFunctionData,
    testnetBradbury,
  } = getBradburyContext();
  if (!account) {
    throw new Error("Missing PRIVATE_KEY or GENLAYER_PRIVATE_KEY for backend-signed Bradbury transaction");
  }

  const valueBigInt = toBigInt(value);
  const callData = abi.calldata.encode(
    abi.calldata.makeCalldataObject(functionName, args, undefined)
  );
  const txData = abi.transactions.serialize([callData, false]);
  const addArgs = [
    account.address,
    contractAddress,
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
      value: `0x${valueBigInt.toString(16)}`,
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
    value: valueBigInt,
    gas,
    gasPrice: BigInt(gasPriceHex),
    chainId: testnetBradbury.id,
  });

  const evmHash = await client.sendRawTransaction({ serializedTransaction });
  const evmReceipt = await waitEvmReceipt(evmHash);
  if (evmReceipt.status === "0x0" || evmReceipt.status === "reverted") {
    throw new Error(`EVM transaction reverted before GenLayer consensus tx creation: ${evmHash}`);
  }

  const txHash = extractTxIdFromLogs(evmReceipt.logs);
  if (!txHash) {
    const receiptTopics = (evmReceipt.logs || [])
      .map(log => log.topics?.[0])
      .filter(Boolean)
      .slice(0, 5)
      .join(", ");
    throw new Error(`EVM transaction succeeded but no GenLayer tx id was emitted: ${evmHash}${receiptTopics ? `; receipt topics: ${receiptTopics}` : ""}`);
  }

  const waitForAcceptance = options.waitForAcceptance === true;
  const receipt = await waitAcceptedIfRequested(txHash, functionName, waitForAcceptance);
  return {
    confirmation_status: receipt ? "accepted" : "submitted",
    evm_tx_hash: evmHash,
    receipt,
    tx_hash: txHash,
  };
}

module.exports = {
  extractTxIdFromLogs,
  readContract,
  sendSignedWrite,
  toBigInt,
};
