import bs58 from "bs58";
import { NextFunction, Request, Response } from "express";
import nacl from "tweetnacl";

const SESSION_MS = 24 * 60 * 60 * 1000;

/**
 * Verifies the wallet session signature sent by the frontend:
 *   x-wallet:    base58 address
 *   x-message:   base64("Blink Escrow session\nwallet:<addr>\nts:<ms>")
 *   x-signature: base58 ed25519 signature of the message
 * Sets req.wallet on success.
 */
export function requireWallet(req: Request, res: Response, next: NextFunction) {
  try {
    const wallet = req.get("x-wallet");
    const msgB64 = req.get("x-message");
    const sigB58 = req.get("x-signature");
    if (!wallet || !msgB64 || !sigB58) return res.status(401).json({ error: "Missing wallet signature" });

    const message = Buffer.from(msgB64, "base64").toString("utf8");
    const m = message.match(/^Blink Escrow session\nwallet:([1-9A-HJ-NP-Za-km-z]{32,44})\nts:(\d{13})$/);
    if (!m || m[1] !== wallet) return res.status(401).json({ error: "Malformed session message" });
    const ts = Number(m[2]);
    if (Date.now() - ts > SESSION_MS || ts - Date.now() > 60_000) return res.status(401).json({ error: "Session expired, sign again" });

    const ok = nacl.sign.detached.verify(new TextEncoder().encode(message), bs58.decode(sigB58), bs58.decode(wallet));
    if (!ok) return res.status(401).json({ error: "Invalid signature" });
    req.wallet = wallet;
    next();
  } catch {
    res.status(401).json({ error: "Invalid signature" });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!process.env.ADMIN_ADDRESS || req.wallet !== process.env.ADMIN_ADDRESS) return res.status(403).json({ error: "Admin only" });
  next();
}
