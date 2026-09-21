# Tallyo

**Cross-border bill-splitting that settles in seconds. No fees, no 3-day wait, no seed phrase.**

Split bills with friends abroad and settle up in one tap — stablecoin payments that never mention crypto. Built for Monad Metropolis (Consumer Products & Payments track).

---

## The problem

Splitting costs with friends in another country is broken. International transfers are slow (1–3 days), expensive, and opaque. Apps like Splitwise track who owes what, but when it's time to actually pay someone overseas you're back to banks and remittance apps. Crypto could fix the payment rail — instant, near-free, global — but every crypto app throws seed phrases, wallets, gas, and jargon at people who just want to pay a friend back.

## What Tallyo does

Tallyo is a bill-splitting app for people with friends across borders. You track shared expenses in a group, Tallyo nets out who owes whom, and you settle up in a single tap. Under the hood that tap moves a stablecoin across borders on Monad and arrives in seconds — but the person using it never sees a blockchain. They log in with an email, and everything reads in plain money terms: *"You owe Alex $15,"* tap **Settle**, done.

It works like a consumer payments app, not a crypto app — which is exactly the point.

## Features

- **Email login, invisible wallet** — Privy embedded wallets; no seed phrase, no extension.
- **Group expense splitting** — split evenly or by exact amounts, with participant selection.
- **Automatic netting** — reduces who-owes-whom to the smallest set of payments.
- **One-tap settlement** — pays the netted balance in stablecoin on Monad, cross-border, in seconds.
- **On-chain verifiability** — every settlement links to its transaction on the block explorer.
- **Invite links** — share a link; the recipient joins by simply logging in.
- **Payment request links** — a cross-border "request money" link anyone can pay in one tap.
- **Direct transfers** — send stablecoin to any user by email, with recent-contact shortcuts.
- **Activity feed** — every transfer carries a human-readable purpose and an on-chain link.
- **Real-time updates** — a settlement by one member appears on another's screen within seconds.

## Design principle: only the money is on-chain

Tallyo puts on-chain exactly what needs to be trustless and tamper-proof — the transfer of value — and keeps everything else (the ledger, who owes whom, group data) off-chain where it's fast, free, and flexible. That's what lets it feel like a normal payments app while still giving the verifiability of a stablecoin settlement.

## Tech stack

| Layer | Tech |
|---|---|
| Chain | Monad Testnet (chain id 10143) |
| Settlement asset | mUSD — an ERC-20 stablecoin deployed on Monad |
| Smart contracts | Solidity + Foundry + OpenZeppelin |
| Auth & wallets | **Privy** — email login + embedded wallets, used **beyond authentication** to sign on-chain transfers |
| Frontend | React (Vite) + viem |
| Backend | Python + FastAPI + SQLAlchemy (SQLite) |
| Auth verification | Privy access tokens (ES256 JWT) verified server-side + per-group authorization |

### On Privy (beyond login)

Privy handles email login and creates an embedded wallet for every user with no seed phrase. Crucially, that wallet is used **beyond authentication**: the user's Privy wallet signs and sends the actual on-chain stablecoin transfers that settle every debt, payment request, and direct transfer. The wallet is the payment instrument, not just a login.

## Repository structure

```
tallyo/
├── metropolis/        # Solidity contracts (mUSD stablecoin) — Foundry project
├── tallyo-backend/    # FastAPI + SQLAlchemy backend
└── tallyo-frontend/   # React (Vite) frontend
```

## Running locally

> Requires Node.js, Python 3, and Foundry.

**1. Contracts** (already deployed to Monad Testnet; redeploy if you want your own)

```bash
cd metropolis
forge build
# deploy mUSD to Monad testnet with your own funded test wallet
```

**2. Backend**

```bash
cd tallyo-backend
python3 -m venv venv && source venv/bin/activate
pip install fastapi uvicorn sqlalchemy "pyjwt[crypto]" python-dotenv "pydantic[email]"
# create a .env with PRIVY_APP_ID and PRIVY_VERIFICATION_KEY (see .env.example)
uvicorn main:app --reload
```

**3. Frontend**

```bash
cd tallyo-frontend
npm install
# create a .env with VITE_PRIVY_APP_ID
npm run dev
```

The app runs at `http://localhost:5173`, the API at `http://localhost:8000`.

> **Note:** `.env` files (with Privy keys) and the SQLite database are intentionally not committed. See `.env.example` files for the variables each service needs.

## Track fit

Tallyo is a payments app that never mentions a blockchain to the person using it, and it settles group spending across borders without an intermediary — the two things the Consumer Products & Payments track is about. The hard part isn't the transfer; it's making the first five minutes feel like money, not crypto.

## License

MIT
