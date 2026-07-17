import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AuthHeaders } from "../lib/api";

export type InjectedSolanaWallet = {
  isPhantom?: boolean;
  isSolflare?: boolean;
  publicKey?: PublicKey;
  connect: (options?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey?: PublicKey }>;
  disconnect?: () => Promise<void>;
  signMessage?: (message: Uint8Array, display?: "utf8") => Promise<{ signature: Uint8Array }>;
  signTransaction: <T>(transaction: T) => Promise<T>;
  signAllTransactions: <T>(transactions: T[]) => Promise<T[]>;
  on?: (event: string, callback: (publicKey?: PublicKey) => void) => void;
  removeListener?: (event: string, callback: (publicKey?: PublicKey) => void) => void;
};

type WalletContextValue = {
  wallet: InjectedSolanaWallet | null;
  publicKey: PublicKey | null;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  getAuthHeaders: () => Promise<AuthHeaders>;
};

const WalletContext = createContext<WalletContextValue | null>(null);

function detectedWallets(): InjectedSolanaWallet[] {
  const phantom = window.phantom?.solana ?? window.solana;
  const solflare = window.solflare;
  return [phantom, solflare].filter(
    (candidate, index, all): candidate is InjectedSolanaWallet =>
      Boolean(candidate) && all.indexOf(candidate) === index,
  );
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [wallet, setWallet] = useState<InjectedSolanaWallet | null>(null);
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const authCache = useRef<{ wallet: string; expiresAt: number; headers: AuthHeaders } | null>(null);

  const attachWallet = useCallback((provider: InjectedSolanaWallet, key: PublicKey) => {
    setWallet(provider);
    setPublicKey(key);
    setError(null);
  }, []);

  useEffect(() => {
    const provider = detectedWallets()[0];
    if (!provider) return;
    provider.connect({ onlyIfTrusted: true })
      .then((result) => {
        const key = result.publicKey ?? provider.publicKey;
        if (key) attachWallet(provider, key);
      })
      .catch(() => undefined);
  }, [attachWallet]);

  useEffect(() => {
    if (!wallet?.on) return;
    const handleAccountChange = (key?: PublicKey) => {
      authCache.current = null;
      setPublicKey(key ?? null);
      if (!key) setWallet(null);
    };
    wallet.on("accountChanged", handleAccountChange);
    return () => wallet.removeListener?.("accountChanged", handleAccountChange);
  }, [wallet]);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const provider = detectedWallets()[0];
      if (!provider) {
        throw new Error("Install Phantom or Solflare to connect a Solana wallet.");
      }
      const result = await provider.connect();
      const key = result.publicKey ?? provider.publicKey;
      if (!key) throw new Error("The wallet connected without returning an account.");
      attachWallet(provider, key);
    } catch (connectError) {
      const message = connectError instanceof Error ? connectError.message : "Wallet connection failed.";
      setError(message);
      throw connectError;
    } finally {
      setConnecting(false);
    }
  }, [attachWallet]);

  const disconnect = useCallback(async () => {
    await wallet?.disconnect?.();
    authCache.current = null;
    setWallet(null);
    setPublicKey(null);
  }, [wallet]);

  const getAuthHeaders = useCallback(async (): Promise<AuthHeaders> => {
    if (!wallet || !publicKey) throw new Error("Connect your wallet first.");
    if (!wallet.signMessage) throw new Error("This wallet does not support message signing.");

    const address = publicKey.toBase58();
    const cached = authCache.current;
    if (cached && cached.wallet === address && cached.expiresAt > Date.now()) return cached.headers;

    const timestamp = Date.now().toString();
    const message = new TextEncoder().encode(`stakely-auth:${timestamp}`);
    const signed = await wallet.signMessage(message, "utf8");
    const headers: AuthHeaders = {
      "x-wallet-address": address,
      "x-signature": bs58.encode(signed.signature),
      "x-timestamp": timestamp,
    };
    authCache.current = { wallet: address, expiresAt: Date.now() + 4 * 60 * 1000, headers };
    return headers;
  }, [publicKey, wallet]);

  const value = useMemo<WalletContextValue>(() => ({
    wallet,
    publicKey,
    connected: Boolean(wallet && publicKey),
    connecting,
    error,
    connect,
    disconnect,
    getAuthHeaders,
  }), [connect, connecting, disconnect, error, getAuthHeaders, publicKey, wallet]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used inside WalletProvider");
  return context;
}

declare global {
  interface Window {
    solana?: InjectedSolanaWallet;
    phantom?: { solana?: InjectedSolanaWallet };
    solflare?: InjectedSolanaWallet;
  }
}
