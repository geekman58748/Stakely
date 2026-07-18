"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.optionalAuth = optionalAuth;
const tweetnacl_1 = __importDefault(require("tweetnacl"));
const bs58_1 = __importDefault(require("bs58"));
/**
 * Wallet signature auth middleware.
 * Client signs the message: "stakely-auth:<timestamp>" with their Solana wallet.
 * Headers: x-wallet-address, x-signature (base58), x-timestamp (unix ms)
 *
 * Timestamp must be within 5 minutes to prevent replay attacks.
 */
function requireAuth(req, res, next) {
    const wallet = req.headers["x-wallet-address"];
    const signature = req.headers["x-signature"];
    const timestamp = req.headers["x-timestamp"];
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
    let sigBytes;
    let pubkeyBytes;
    try {
        sigBytes = bs58_1.default.decode(signature);
        pubkeyBytes = bs58_1.default.decode(wallet);
    }
    catch {
        res.status(401).json({ error: "Invalid base58 in wallet address or signature" });
        return;
    }
    const valid = tweetnacl_1.default.sign.detached.verify(message, sigBytes, pubkeyBytes);
    if (!valid) {
        res.status(401).json({ error: "Invalid signature" });
        return;
    }
    req.walletAddress = wallet;
    next();
}
/** Optional auth — attaches wallet if headers present, continues either way */
function optionalAuth(req, res, next) {
    const wallet = req.headers["x-wallet-address"];
    if (wallet)
        req.walletAddress = wallet;
    next();
}
