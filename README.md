# Blink Share

A full-stack, milestone-based escrow platform on Solana. Clients create gig "vaults" that lock SPL tokens on-chain; workers accept the gig, propose milestones, and get paid per milestone. Disputes are arbitrated by a designated admin who can split locked funds on-chain. Gigs are shareable via Solana Blinks, so a worker can accept a job directly from a social feed.

## Architecture

The repo is a monorepo with three components:

```
├── programs/blink_escrow/   # Anchor program (Rust) — on-chain escrow vaults
├── client/backend/          # Express + Mongoose API — off-chain gig metadata
├── client/frontend/         # TanStack Start (React + Vite) web app
├── Anchor.toml              # Anchor workspace config (localnet)
└── Cargo.toml               # Rust workspace
```

**Program ID:** `35nqDayAETPzRnjLw5bxEiw3ovzSndMp4caQLF1PXFGz`

### On-chain program (`programs/blink_escrow`)

An Anchor program that manages escrow vaults as PDAs. Each vault stores a `client`, an optional `worker`, an `admin`, a `vault_id` (max 16 chars), a 32-byte `job_info` hash, and at most one `active_milestone` containing a `requirement_hash`, `token_amt`, `is_satisfied` flag, and an optional `dispute_hash`.

PDA seeds:

- Vault account: `["escrow_user", v_id.as_bytes()]`
- Vault token account: `["tk_acct", v_id.as_bytes()]` (authority = vault PDA)

Instructions:

| Instruction | Signer | Description |
| --- | --- | --- |
| `create_escrow_vault(v_id, job_info, admin)` | client | Initializes the vault PDA; `job_info` is `sha256(jobDescription)` |
| `create_tkn_acct()` | payer | Creates the vault token account PDA for a given mint (batched with vault creation) |
| `accept_blink_job()` | worker | Assigns `worker` if the job is unclaimed |
| `deposit_milestone_tkns(milestone)` | client | Transfers SPL tokens into the vault token PDA and activates a milestone; requires an assigned worker and no unsatisfied prior milestone |
| `release_milestone_tkns()` | client or admin | Transfers the locked amount to the worker's token account; fails if the milestone is disputed |
| `dispute_milestone(dispute_hash)` | client or worker | Attaches a 32-byte dispute hash to the active milestone |
| `admin_release(worker_amt, client_amt)` | admin | Settles a disputed milestone by splitting the locked amount; `worker_amt + client_amt` must equal the locked total |

### Backend (`client/backend`)

Express + Mongoose API that stores off-chain metadata (titles, briefs, deliverables, dispute evidence) that would be too large/costly on-chain. Every write is authorized by a wallet signature (`x-wallet`, `x-message`, `x-signature` headers — base58 Ed25519 verified with `tweetnacl`) and cross-checked against on-chain vault state via `@solana/kit`, so the database can't drift from the program. Includes `helmet`, CORS allow-listing, `express-rate-limit`, and `zod` validation.

Endpoints:

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/escrows?status=&address=` | public |
| GET | `/escrows/:vaultId` | public |
| POST | `/escrows` | client wallet |
| POST | `/escrows/:vaultId/accept` | on-chain worker |
| POST | `/escrows/:vaultId/milestones` | on-chain worker |
| PATCH | `/milestones/:vaultId/:index` | client / worker / admin |
| POST | `/disputes` | client or worker |
| GET | `/disputes?resolved=false` | public |
| POST | `/disputes/resolve` | admin |

### Frontend (`client/frontend`)

TanStack Start (React 19, Vite, Tailwind CSS 4, Radix UI) app using `@solana/kit` and `@solana/react` (not legacy `web3.js`) for wallet connection and transaction building. Uses `js-sha256` for requirement/dispute hashes and `nanoid(12)` for vault IDs.

## Gig lifecycle

1. **Create** — client submits a title, brief, mint, and budget. The app hashes the brief (`job_info`), generates a `vaultId`, and sends `create_escrow_vault` + `create_tkn_acct` in one transaction, then saves metadata to the API.
2. **Accept** — a worker claims the gig via `accept_blink_job` (in-app or through a shared Blink).
3. **Propose** — the worker proposes a milestone (title, description, deliverables, amount); stored off-chain with status `proposed_by_worker`.
4. **Fund** — the client accepts and signs `deposit_milestone_tkns`; the milestone's `requirement_hash` is `sha256` of the milestone payload, so the on-chain hash is verifiable against the DB record.
5. **Release** — the client (or admin) signs `release_milestone_tkns`, paying the worker.
6. **Dispute** — either party calls `dispute_milestone` with a `dispute_hash`; evidence is stored off-chain and verified by hash.
7. **Arbitrate** — the admin reviews evidence in the admin panel and calls `admin_release` with a split that sums to the locked amount.

## Prerequisites

- Rust + Cargo and the [Anchor CLI](https://www.anchor-lang.com/docs/installation)
- Solana CLI (for `solana-test-validator` and keypair at `~/.config/solana/id.json`)
- Node.js 20+
- A MongoDB instance (Atlas or local)

## Running locally

### Program

```bash
anchor build
anchor test        # runs ts-mocha tests per Anchor.toml [scripts].test
```

`Anchor.toml` targets `Localnet`; the wallet defaults to `~/.config/solana/id.json`.

### Backend

```bash
cd client/backend
cp .env.example .env   # fill in values
npm install
npm run dev            # tsx --watch, serves on PORT (default 4000)
```

Backend env vars (`.env.example`):

| Var | Description |
| --- | --- |
| `MONGODB_URI` | MongoDB connection string |
| `ADMIN_ADDRESS` | Admin/arbitrator wallet (base58) |
| `PROGRAM_ID` | Deployed program ID |
| `SOLANA_RPC_URL` | RPC endpoint (e.g. devnet) |
| `ALLOWED_ORIGIN` | Comma-separated frontend origins (`*.lovable.app` allowed automatically) |
| `PORT` | Server port |

### Frontend

```bash
cd client/frontend
npm install
npm run dev            # vite dev
```

Configure the frontend env to point at the backend (`VITE_API_URL`) and the program ID per `client/frontend/README.md`.

## Deployment

- **Backend:** deploy as a web service with root directory `client/backend`, build `npm install`, start `npm start` (Node 20+). In MongoDB Atlas, allow the host's outbound IPs.
- **Program:** `anchor deploy` against the target cluster; update `PROGRAM_ID`/`NEXT_PUBLIC_PROGRAM_ID` accordingly.

## Tech stack

- **On-chain:** Anchor (`anchor-lang`, `anchor_spl` token interface), Rust
- **Backend:** Express 4, Mongoose, `@solana/kit`, `tweetnacl`, `bs58`, `zod`, `helmet`, `express-rate-limit`, TypeScript (`tsx` for dev)
- **Frontend:** React 19, TanStack Start/Router/Query, Vite, Tailwind CSS 4, Radix UI, `@solana/kit`, `@solana/react`, `js-sha256`, `nanoid`, `react-toastify`

## Project structure

```
programs/blink_escrow/src/
├── lib.rs            # program entrypoint + instruction handlers
├── instructions.rs   # #[derive(Accounts)] account structs and constraints
├── data_struct.rs    # EscrowVault / MileStoneContract account data
└── errors.rs         # AppErrors
```
