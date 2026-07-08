export interface EthereumProvider {
  request<T = unknown>(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<T>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export function getEthereumProvider(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  return window.ethereum ?? null;
}

export function normalizeWalletAddress(address: string | undefined | null): string {
  return typeof address === "string" ? address.trim() : "";
}

export function isWalletAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

export async function requestWalletAccount(): Promise<string> {
  const provider = getEthereumProvider();
  if (!provider) {
    throw new Error("No browser wallet found. Install MetaMask or another EVM wallet.");
  }

  const accounts = await provider.request<string[]>({ method: "eth_requestAccounts" });
  const account = normalizeWalletAddress(accounts?.[0]);
  if (!isWalletAddress(account)) {
    throw new Error("Wallet did not return a valid address.");
  }
  return account;
}

export async function getConnectedWalletAccount(): Promise<string> {
  const provider = getEthereumProvider();
  if (!provider) return "";

  const accounts = await provider.request<string[]>({ method: "eth_accounts" });
  return normalizeWalletAddress(accounts?.[0]);
}
