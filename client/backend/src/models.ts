import mongoose from "mongoose";

const { Schema, model } = mongoose;

const EscrowSchema = new Schema(
  {
    vaultId: { type: String, required: true, unique: true, maxlength: 16, index: true },
    title: { type: String, required: true, maxlength: 120 },
    description: { type: String, required: true, maxlength: 5000 },
    category: { type: String, default: "Other", maxlength: 40 },
    budget: { type: String, maxlength: 32 },
    clientAddress: { type: String, required: true, index: true },
    workerAddress: { type: String, default: null, index: true },
    adminAddress: { type: String, required: true },
    mintAddress: { type: String, required: true },
    status: { type: String, enum: ["open", "in_progress", "completed", "disputed"], default: "open", index: true },
  },
  { timestamps: true },
);

const MilestoneSchema = new Schema(
  {
    vaultId: { type: String, required: true, index: true },
    milestoneIndex: { type: Number, required: true },
    title: { type: String, required: true, maxlength: 120 },
    description: { type: String, required: true, maxlength: 3000 },
    deliverables: { type: String, default: "", maxlength: 2000 },
    tokenAmount: { type: String, required: true },
    requirementHash: { type: String },
    status: {
      type: String,
      enum: ["proposed_by_worker", "funded_active", "submitted", "released", "disputed"],
      default: "proposed_by_worker",
    },
  },
  { timestamps: true },
);
MilestoneSchema.index({ vaultId: 1, milestoneIndex: 1 }, { unique: true });

const DisputeSchema = new Schema(
  {
    vaultId: { type: String, required: true, index: true },
    milestoneIndex: { type: Number, required: true },
    disputedBy: { type: String, enum: ["client", "worker"], required: true },
    reason: { type: String, required: true, maxlength: 4000 },
    evidenceUrls: { type: [String], default: [] },
    claimSummary: { type: String, required: true, maxlength: 300 },
    disputeHash: { type: String, required: true },
    resolved: { type: Boolean, default: false, index: true },
    split: { workerAmt: String, clientAmt: String },
  },
  { timestamps: true },
);
DisputeSchema.index({ vaultId: 1, milestoneIndex: 1, disputedBy: 1 }, { unique: true });

export const Escrow = model("Escrow", EscrowSchema);
export const Milestone = model("Milestone", MilestoneSchema);
export const Dispute = model("Dispute", DisputeSchema);
