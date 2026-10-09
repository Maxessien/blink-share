# Blink Escrow API (Express + Mongoose)

Stores off-chain gig metadata (titles, briefs, milestones, dispute evidence). Every write is authorized by a wallet signature and cross-checked against the on-chain escrow account, so the database can't drift from what the Solana program holds.

## Run locally

```bash
cd backend
cp .env.example .env   # fill in values
npm install
npm run dev
```

## Deploy (Render or Railway)

1. Push this repo to GitHub.
2. Create a new **Web Service** and set its root directory to `backend`.
3. Build command `npm install`, start command `npm start`, Node 20+.
4. Add the env vars from `.env.example`. Set `ALLOWED_ORIGIN` to your published app URL. `*.lovable.app` origins are allowed automatically.
5. In MongoDB Atlas → Network Access, allow the host's outbound IPs (or `0.0.0.0/0`).
6. Copy the service URL (for example `https://blink-escrow-api.onrender.com`). It goes into the frontend as `VITE_API_URL`.

## Endpoints

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

Auth headers: `x-wallet`, `x-message` (base64 session text), `x-signature` (base58 Ed25519).
