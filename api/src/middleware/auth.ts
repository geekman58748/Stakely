import { Request, Response, NextFunction } from "express";
import nacl from "tweetnacl";
import bs58 from "bs58";

declare global {
  namespace Express {
    interface Request {
      walletAddress?: string;
    }
  }
}

/**
 * Wallet signature auth middleware.
 * Client signs the message: "stakely-auth:<timestamp>" with their Solana wallet.
 * Headers: x-wallet-address, x-signature (base58), x-timestamp (unix ms)
 *
 * Timestamp must be within 5 minutes to prevent replay attacks.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const wallet    = req.headers["x-wallet-address"] as string;
  const signature = req.headers["x-signature"] as string;
  const timestamp = req.headers["x-timestamp"] as string;

  if (!wallet || !signature || !timestamp) {
    res.status(401).json({ error: "Missing auth headers: x-wallet-address, x-signature, x-timestamp" });
    return;
  }

  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(Date.now() - ts) > 5 * 60 * 1000) {
    res.status(401).json({ error: "Timestamp expired or invalid (must be within 5 minutes)" });
    return;
  }

  const message = new TextEncoder().encode(`stakely-auth:${timestamp}`);
  let sigBytes: Uint8Array;
  let pubkeyBytes: Uint8Array;

  try {
    sigBytes    = bs58.decode(signature);
    pubkeyBytes = bs58.decode(wallet);
  } catch {
    res.status(401).json({ error: "Invalid base58 in wallet address or signature" });
    return;
  }

  const valid = nacl.sign.detached.verify(message, sigBytes, pubkeyBytes);
  if (!valid) {
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  req.walletAddress = wallet;
  next();
}

/** Optional auth — attaches wallet if headers present, continues either way */
export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const wallet = req.headers["x-wallet-address"] as string;
  if (wallet) req.walletAddress = wallet;
  next();
}
