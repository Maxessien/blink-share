# Blink Escrow Hub

Build a production-ready, full-stack Solana Escrow web application called "Blink Escrow" using Solana Kit (@solana/kit) and a Next.js App Router frontend with MongoDB for off-chain metadata.

### 1. Environment & Config
Set up configuration using minimal environment variables (Solana Kit manages RPC routing/clusters directly):
- `NEXT_PUBLIC_PROGRAM_ID`: Anchor Program ID (e.g. 35nqDayAETPzRnjLw5bxEiw3ovzSndMp4caQLF1PXFGz)
- `NEXT_PUBLIC_ADMIN_ADDRESS`: Base58 public address of the platform admin/arbitrator
- `MONGODB_URI`: MongoDB connection string

### 2. Tech Stack & Dependencies
- Solana: Use `@solana/kit` and `@solana/react` (do NOT use legacy `@solana/web3.js`). Configure cluster to Devnet via Solana Kit defaults.
- Frontend: Next.js (App Router), TypeScript, Tailwind CSS, Lucide React, @tanstack/react-query, nextjs-toploader, react-toastify.
- Hashing & IDs: `js-sha256` (to generate 32-byte arrays for requirement and dispute hashes), `nanoid` (for vault IDs <= 16 chars).
- Actions / Blinks: `@solana/actions` for shareable Blink card endpoints.

### 3. Smart Contract Specifications (Anchor)
The application interacts with an Anchor program via Solana Kit's transaction builder:
1. `create_escrow_vault(v_id: string, job_info: [u8; 32], admin: Address)`:
   - PDA seeds: `[b"escrow_user", v_id.as_bytes()]`
   - `v_id` MUST be <= 16 characters (generate using `nanoid(12)`).
   - `job_info`: 32-byte array computed from `sha256(jobDescription)`.
   - `admin`: passed from `NEXT_PUBLIC_ADMIN_ADDRESS`.
2. `create_tkn_acct()`:
   - Initializes the vault token account PDA with seeds: `[b"tk_acct", v_id.as_bytes()]`.
   - Batched in the same transaction as `create_escrow_vault`.
3. `accept_blink_job()`:
   - Worker signs and assigns their address to `escrow_vault.worker`.
4. `deposit_milestone_tkns(milestone: { requirement_hash: [u8; 32], token_amt: u64 })`:
   - Enforces `has_one = client`. Client deposits tokens into vault token PDA and sets active milestone.
5. `release_milestone_tkns()`:
   - Client or Admin signs. Transfers tokens from vault token PDA to worker ATA; marks milestone satisfied.
6. `dispute_milestone(dispute_hash: [u8; 32])`:
   - Client or Worker signs with 32-byte `dispute_hash` if a milestone is unsatisfied and undisputed.
7. `admin_release(worker_amt: u64, client_amt: u64)`:
   - Callable only by `NEXT_PUBLIC_ADMIN_ADDRESS`.
   - `worker_amt + client_amt` must equal the locked milestone amount. Disburses split and marks milestone satisfied.

### 4. Database Models (MongoDB via Mongoose)
1. `Escrow`:
   - `vaultId` (String, unique, <= 16 chars)
   - `title`, `description`, `category`
   - `clientAddress`, `workerAddress`, `adminAddress`
   - `mintAddress`, `status` ("open", "in_progress", "completed", "disputed")
2. `Milestone`:
   - `vaultId`, `milestoneIndex`
   - `title`, `description`, `deliverables`
   - `tokenAmount`
   - `requirementHash` (Hex string of sha256)
   - `status` ("proposed_by_worker", "funded_active", "submitted", "released", "disputed")
3. `Dispute`:
   - `vaultId`, `milestoneIndex`
   - `disputedBy` ("client" | "worker")
   - `reason`, `evidenceUrls`, `claimSummary`
   - `disputeHash` (Hex string of sha256)
   - `resolved`: Boolean, `split`: { workerAmt: String, clientAmt: String }

### 5. Application Pages & Flows

#### A. App Shell & Wallet Provider
- Wrap the app with Solana Kit's React provider targeting Devnet.
- Header with navigation: Explore Gigs, Create Gig, My Vaults, and Admin Dashboard.
- Wallet connect button using Solana Kit connectors. Show connected address and Devnet badge.

#### B. Create Gig (`/create`)
- Inputs: Title, detailed brief, token mint (Devnet USDC / native token option), and budget.
- Creates `vaultId = nanoid(12)`.
- Calculates `job_info = sha256(brief)`.
- Builds and executes transaction chaining `create_escrow_vault` + `create_tkn_acct`.
- Saves record to MongoDB and redirects to `/vault/[vaultId]`.

#### C. Vault Detail & Lifecycle (`/vault/[vaultId]`)
- Reads on-chain account state and joins with MongoDB metadata.
- **Worker Unassigned:**
  - Any wallet can click "Accept Job" (`accept_blink_job`).
  - "Share as Blink" copy button generating a shareable URL.
- **Worker Assigned & No Active Milestone:**
  - Worker only: Form to propose next milestone (Title, Description, Amount). Saves to DB with status `proposed_by_worker`.
  - Client only: Views proposal card and clicks "Accept & Fund Milestone".
  - On accept: App hashes `JSON.stringify({ title, description, deliverables, tokenAmount })`, client signs `deposit_milestone_tkns`, and DB updates to `funded_active`.
- **Milestone Active:**
  - Displays token amount locked in escrow PDA.
  - Client has "Release Payment" button (`release_milestone_tkns`).
  - Both Client and Worker have "Raise Dispute" button opening a modal.
- **Dispute Modal:**
  - Form capturing dispute rationale and proof links.
  - Generates 32-byte `dispute_hash = sha256(disputeData)`.
  - Saves evidence to MongoDB, executes `dispute_milestone` on Solana, and updates UI to disputed state.

#### D. Admin Arbitration Panel (`/admin`)
- Accessible only when connected address matches `NEXT_PUBLIC_ADMIN_ADDRESS`.
- Lists all vaults with active disputes.
- Dispute Viewer:
  - Fetches original milestone brief and both dispute statements from MongoDB.
  - Verification chip showing `sha256(db_record) === onChain.dispute_hash`.
  - Split Slider allocating `worker_amt` and `client_amt` (enforcing sum === milestone total).
  - "Arbitrate & Settle" button executing `admin_release(worker_amt, client_amt)`.

#### E. Solana Actions / Blinks Route (`/api/actions/accept/[vaultId]`)
- Implements Solana Actions protocol:
  - `GET`: Returns JSON metadata (title, icon, description, "Accept Gig" action).
  - `POST`: Constructs the serialized `accept_blink_job` transaction using Solana Kit and returns it for signing in social feeds.

### 6. Design & UI
- Dark theme using with emerald and purple accents.
- Solana Explorer links for every transaction signature.
- Clear error toasts and loading states for transaction lifecycles.
- Do not make use of any ui lib except explicitly specified, all ui should be built from scratch except the toaster which should use react toastify


### Note
- Reference this github repository "https://github.com/Maxessien/blink-share" for better understanding of the anchor program

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/e4c037a2-0dbc-499f-b995-a6bb9dfb4862).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
