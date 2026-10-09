import { config } from "dotenv"

config()

import { createHash } from "node:crypto";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { z } from "zod";
import { requireAdmin, requireWallet } from "./auth.js";
import { readVault } from "./chain.js";
import { connectDb } from "./db.js";
import { Dispute, Escrow, Milestone } from "./models.js";

declare global {
  namespace Express {
    interface Request {
      wallet?: string;
    }
  }
}

for (const k of ["MONGODB_URI", "ADMIN_ADDRESS"]) {
  if (!process.env[k]) {
    console.error(`Missing env ${k}`);
    process.exit(1);
  }
}

const sha256 = (s: string) =>
  createHash("sha256").update(s, "utf8").digest("hex");
const addr = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
const vaultId = z
  .string()
  .min(1)
  .max(16)
  .regex(/^[A-Za-z0-9_-]+$/);
const amount = z.string().regex(/^\d{1,20}$/);

const app = express();
app.set("trust proxy", 1);
app.use(helmet());
const origins = (process.env.ALLOWED_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) =>
      cb(
        null,
        !origin ||
          origins.length === 0 ||
          origins.includes(origin) ||
          /\.lovable\.app$/.test(new URL(origin).hostname),
      ),
    allowedHeaders: ["Content-Type", "x-wallet", "x-message", "x-signature"],
  }),
);
app.use(express.json({ limit: "100kb" }));
app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  }),
);

const wrap =
  (fn: (req: Request, res: Response, next: NextFunction) => any) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);

const parse = <T>(schema: z.ZodType<T>, data: unknown, res: Response): T | null => {
  const r = schema.safeParse(data);
  if (!r.success) {
    res
      .status(400)
      .json({
        error: r.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
    return null;
  }
  return r.data;
};

app.get("/health", (_req: Request, res: Response) => res.json({ ok: true }));

/* ---------------- Escrows ---------------- */

app.get(
  "/escrows",
  wrap(async (req, res) => {
    const q = parse(
      z.object({
        status: z
          .enum(["open", "in_progress", "completed", "disputed"])
          .optional(),
        address: addr.optional(),
      }),
      req.query,
      res,
    );
    if (!q) return;
    const filter: any = {};
    if (q.status) filter.status = q.status;
    if (q.address)
      filter.$or = [{ clientAddress: q.address }, { workerAddress: q.address }];
    res.json(
      await Escrow.find(filter).sort({ createdAt: -1 }).limit(100).lean(),
    );
  }),
);

app.get(
  "/escrows/:vaultId",
  wrap(async (req, res) => {
    const id = parse(vaultId, req.params.vaultId, res);
    if (!id) return;
    const escrow = await Escrow.findOne({ vaultId: id }).lean();
    if (!escrow) return res.status(404).json({ error: "Escrow not found" });
    const [milestones, disputes] = await Promise.all([
      Milestone.find({ vaultId: id }).sort({ milestoneIndex: 1 }).lean(),
      Dispute.find({ vaultId: id }).sort({ createdAt: 1 }).lean(),
    ]);
    res.json({ escrow, milestones, disputes });
  }),
);

app.post(
  "/escrows",
  requireWallet as any,
  wrap(async (req, res) => {
    const body = parse(
      z.object({
        vaultId,
        title: z.string().trim().min(4).max(120),
        description: z.string().min(20).max(5000),
        category: z.string().max(40).default("Other"),
        budget: z
          .string()
          .regex(/^\d+(\.\d+)?$/)
          .max(32)
          .optional(),
        clientAddress: addr,
        adminAddress: addr,
        mintAddress: addr,
      }),
      req.body,
      res,
    );
    if (!body) return;
    if (body.clientAddress !== req.wallet)
      return res.status(403).json({ error: "Signer must be the client" });
    if (body.adminAddress !== process.env.ADMIN_ADDRESS)
      return res.status(400).json({ error: "Unknown admin address" });

    const vault = await readVault(body.vaultId);
    if (!vault)
      return res.status(400).json({ error: "Vault not found on-chain yet" });
    if (vault.client !== req.wallet)
      return res.status(403).json({ error: "On-chain client mismatch" });
    if (vault.jobInfo !== sha256(body.description))
      return res
        .status(400)
        .json({ error: "Brief doesn't match on-chain job_info hash" });

    const escrow = await Escrow.create({ ...body, status: "open" });
    res.status(201).json(escrow);
  }),
);

app.post(
  "/escrows/:vaultId/accept",
  requireWallet as any,
  wrap(async (req, res) => {
    const id = parse(vaultId, req.params.vaultId, res);
    if (!id) return;
    const vault = await readVault(id);
    if (!vault || vault.worker !== req.wallet)
      return res.status(403).json({ error: "You are not the on-chain worker" });
    const escrow = await Escrow.findOneAndUpdate(
      { vaultId: id },
      { workerAddress: req.wallet, status: "in_progress" },
      { new: true },
    );
    if (!escrow) return res.status(404).json({ error: "Escrow not found" });
    res.json(escrow);
  }),
);

/* ---------------- Milestones ---------------- */

app.post(
  "/escrows/:vaultId/milestones",
  requireWallet as any,
  wrap(async (req, res) => {
    const id = parse(vaultId, req.params.vaultId, res);
    if (!id) return;
    const body = parse(
      z.object({
        title: z.string().trim().min(3).max(120),
        description: z.string().trim().min(10).max(3000),
        deliverables: z.string().max(2000).default(""),
        tokenAmount: amount,
      }),
      req.body,
      res,
    );
    if (!body) return;
    if (BigInt(body.tokenAmount) <= 0n)
      return res.status(400).json({ error: "Amount must be positive" });

    const escrow = await Escrow.findOne({ vaultId: id });
    if (!escrow) return res.status(404).json({ error: "Escrow not found" });
    const vault = await readVault(id);
    if (!vault?.worker || vault.worker !== req.wallet)
      return res.status(403).json({ error: "Only the worker can propose" });
    if (vault.activeMilestone && !vault.activeMilestone.isSatisfied)
      return res.status(409).json({ error: "A milestone is still active" });
    if (await Milestone.exists({ vaultId: id, status: "proposed_by_worker" }))
      return res.status(409).json({ error: "A proposal is already pending" });

    // Keep DB in sync if the worker accepted via a Blink and never hit /accept.
    if (!escrow.workerAddress) {
      escrow.workerAddress = req.wallet;
      escrow.status = "in_progress";
      await escrow.save();
    }
    const milestoneIndex = await Milestone.countDocuments({ vaultId: id });
    const m = await Milestone.create({
      vaultId: id,
      milestoneIndex,
      ...body,
      status: "proposed_by_worker",
    });
    res.status(201).json(m);
  }),
);

app.patch(
  "/milestones/:vaultId/:index",
  requireWallet as any,
  wrap(async (req, res) => {
    const id = parse(vaultId, req.params.vaultId, res);
    const index = parse(z.coerce.number().int().min(0), req.params.index, res);
    if (!id || index === null) return;
    const body = parse(
      z.object({
        status: z.enum(["funded_active", "submitted", "released"]),
        requirementHash: z
          .string()
          .regex(/^[0-9a-f]{64}$/)
          .optional(),
      }),
      req.body,
      res,
    );
    if (!body) return;

    const m = await Milestone.findOne({ vaultId: id, milestoneIndex: index });
    if (!m) return res.status(404).json({ error: "Milestone not found" });
    const vault = await readVault(id);
    if (!vault)
      return res.status(404).json({ error: "Vault not found on-chain" });
    const am = vault.activeMilestone;
    const expectedHash = sha256(
      JSON.stringify({
        title: m.title,
        description: m.description,
        deliverables: m.deliverables,
        tokenAmount: m.tokenAmount,
      }),
    );

    if (body.status === "funded_active") {
      if (req.wallet !== vault.client)
        return res.status(403).json({ error: "Only the client can fund" });
      if (
        !am ||
        am.isSatisfied ||
        am.requirementHash !== expectedHash ||
        am.tokenAmt !== m.tokenAmount
      )
        return res
          .status(409)
          .json({ error: "On-chain deposit doesn't match this milestone" });
      m.requirementHash = expectedHash;
    } else if (body.status === "submitted") {
      if (req.wallet !== vault.worker)
        return res.status(403).json({ error: "Only the worker can submit" });
    } else if (body.status === "released") {
      if (req.wallet !== vault.client && req.wallet !== vault.admin)
        return res.status(403).json({ error: "Only client or admin" });
      if (!am?.isSatisfied || am.requirementHash !== m.requirementHash)
        return res
          .status(409)
          .json({ error: "Milestone not released on-chain" });
    }
    m.status = body.status;
    await m.save();
    res.json(m);
  }),
);

/* ---------------- Disputes ---------------- */

app.post(
  "/disputes",
  requireWallet as any,
  wrap(async (req, res) => {
    const body = parse(
      z.object({
        vaultId,
        milestoneIndex: z.number().int().min(0),
        reason: z.string().trim().min(20).max(4000),
        evidenceUrls: z.array(z.string().url().max(500)).max(10),
        claimSummary: z.string().trim().min(5).max(300),
        disputeHash: z.string().regex(/^[0-9a-f]{64}$/),
      }),
      req.body,
      res,
    );
    if (!body) return;
    const vault = await readVault(body.vaultId);
    if (!vault)
      return res.status(404).json({ error: "Vault not found on-chain" });
    const disputedBy =
      req.wallet === vault.client
        ? "client"
        : req.wallet === vault.worker
          ? "worker"
          : null;
    if (!disputedBy)
      return res
        .status(403)
        .json({ error: "Only the client or worker can dispute" });

    const recomputed = sha256(
      JSON.stringify({
        vaultId: body.vaultId,
        milestoneIndex: body.milestoneIndex,
        reason: body.reason,
        evidenceUrls: body.evidenceUrls,
        claimSummary: body.claimSummary,
      }),
    );
    if (recomputed !== body.disputeHash)
      return res
        .status(400)
        .json({ error: "dispute hash doesn't match statement" });
    if (
      !vault.activeMilestone?.disputeHash ||
      vault.activeMilestone.isSatisfied
    )
      return res
        .status(409)
        .json({ error: "Milestone isn't disputed on-chain" });

    const m = await Milestone.findOne({
      vaultId: body.vaultId,
      milestoneIndex: body.milestoneIndex,
    });
    if (!m) return res.status(404).json({ error: "Milestone not found" });

    const d = await Dispute.create({ ...body, disputedBy });
    m.status = "disputed";
    await m.save();
    await Escrow.updateOne({ vaultId: body.vaultId }, { status: "disputed" });
    res.status(201).json(d);
  }),
);

app.get(
  "/disputes",
  wrap(async (req, res) => {
    const q = parse(
      z.object({ resolved: z.enum(["true", "false"]).optional() }),
      req.query,
      res,
    );
    if (!q) return;
    const filter: any = q.resolved ? { resolved: q.resolved === "true" } : {};
    res.json(
      await Dispute.find(filter).sort({ createdAt: -1 }).limit(200).lean(),
    );
  }),
);

app.post(
  "/disputes/resolve",
  requireWallet as any,
  requireAdmin as any,
  wrap(async (req, res) => {
    const body = parse(
      z.object({
        vaultId,
        milestoneIndex: z.number().int().min(0),
        split: z.object({ workerAmt: amount, clientAmt: amount }),
      }),
      req.body,
      res,
    );
    if (!body) return;
    const vault = await readVault(body.vaultId);
    if (!vault?.activeMilestone?.isSatisfied)
      return res
        .status(409)
        .json({ error: "Settlement not confirmed on-chain" });
    if (
      (
        BigInt(body.split.workerAmt) + BigInt(body.split.clientAmt)
      ).toString() !== vault.activeMilestone.tokenAmt
    )
      return res
        .status(400)
        .json({ error: "Split doesn't equal milestone total" });

    await Dispute.updateMany(
      { vaultId: body.vaultId, milestoneIndex: body.milestoneIndex },
      { resolved: true, split: body.split },
    );
    await Milestone.updateOne(
      { vaultId: body.vaultId, milestoneIndex: body.milestoneIndex },
      { status: "released" },
    );
    await Escrow.updateOne(
      { vaultId: body.vaultId },
      { status: "in_progress" },
    );
    res.json({ ok: true });
  }),
);

/* ---------------- Errors ---------------- */

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err?.code === 11000)
    return res.status(409).json({ error: "Record already exists" });
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const port = Number(process.env.PORT || 4000);
await connectDb(process.env.MONGODB_URI as string);
app.listen(port, () => console.log(`Blink Escrow API on :${port}`));