import { useCallback, useEffect, useState } from "react";
import {
  getConnectedWalletAccount,
  getEthereumProvider,
  isWalletAddress,
  normalizeWalletAddress,
  requestWalletAccount,
} from "@/services/wallet";

export function useBrowserWallet() {
  const [account, setAccount] = useState("");
  const [available, setAvailable] = useState(false);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    const provider = getEthereumProvider();
    setAvailable(Boolean(provider));
    if (!provider) return;

    getConnectedWalletAccount()
      .then(address => {
        if (isWalletAddress(address)) setAccount(address);
      })
      .catch(() => {});

    const handleAccountsChanged = (...args: unknown[]) => {
      const accounts = Array.isArray(args[0]) ? args[0] as string[] : [];
      const next = normalizeWalletAddress(accounts[0]);
      setAccount(isWalletAddress(next) ? next : "");
    };

    provider.on?.("accountsChanged", handleAccountsChanged);
    return () => provider.removeListener?.("accountsChanged", handleAccountsChanged);
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const address = await requestWalletAccount();
      setAccount(address);
      return address;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAccount("");
  }, []);

  return {
    account,
    available,
    connect,
    connecting,
    disconnect,
  };
}
