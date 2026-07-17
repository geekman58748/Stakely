import { useCallback, useEffect, useMemo, useState } from "react";
import { PREVIEW_WALLET, previewBets } from "../data/previewBets";
import { stakelyApi, type Bet } from "../lib/api";
import { useWallet } from "../providers/WalletProvider";

export function useMyBets() {
  const wallet = useWallet();
  const preview = useMemo(() => import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "1", []);
  const [bets, setBets] = useState<Bet[]>(preview ? previewBets : []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (preview) {
      setBets(previewBets);
      setError(null);
      return;
    }
    if (!wallet.connected) {
      setBets([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const auth = await wallet.getAuthHeaders();
      setBets(await stakelyApi.myBets(auth, signal));
    } catch (loadError) {
      if (signal?.aborted) return;
      const message = loadError instanceof Error ? loadError.message : "Could not load your bets.";
      if (message.toLowerCase().includes("user not registered")) setBets([]);
      else setError(message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [preview, wallet.connected, wallet.getAuthHeaders]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return {
    bets,
    loading,
    error,
    preview,
    walletAddress: preview ? PREVIEW_WALLET : wallet.publicKey?.toBase58() ?? null,
    connected: preview || wallet.connected,
    connecting: wallet.connecting,
    connect: wallet.connect,
    refresh: () => load(),
  };
}
