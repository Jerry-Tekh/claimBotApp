# ClaimBot — Parametric Insurance Engine

> Automated parametric insurance powered by GenLayer Intelligent Contracts.
> AI validators read live web sources and trigger instant payouts.

---

## Quick Start (Local Dev — No DB needed)

### Prerequisites
- Node.js 18+
- Python 3.10+ (for contract tests only)
- Git

### 1. Install dependencies

```bash
# From the project root
npm run install:all
```

This installs root, frontend, and backend dependencies in one command.

### 2. Configure environment

```bash
# Backend
cp backend/.env.example backend/.env
# DEMO_MODE=true is already set — no DB or contract needed

# Frontend
cp frontend/.env.example frontend/.env.local
# Points to http://localhost:4000 by default
```

### 3. Run the full stack

```bash
npm run dev
```

This starts:
- **Frontend** → http://localhost:3000  (Next.js)
- **Backend**  → http://localhost:4000  (Express API)

Open http://localhost:3000 to see the landing page.
Open http://localhost:3000/dashboard for the app.

---

## Project Structure

```
claimbot/
│
├── package.json              ← root scripts (npm run dev, install:all)
├── docker-compose.yml        ← full stack with Postgres
├── .gitignore
│
├── contracts/                ← GenLayer Intelligent Contracts (Python)
│   ├── claimbot_main.py      ← main orchestrator (DEPLOY THIS)
│   ├── policy_manager.py     ← policy lifecycle
│   ├── claim_manager.py      ← evidence scoring + LLM evaluation
│   └── treasury_manager.py   ← insurance pool + solvency
│
├── frontend/                 ← Next.js 14 + React + TypeScript
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx          ← root layout
│   │   │   ├── page.tsx            ← landing page route
│   │   │   ├── globals.css         ← Tailwind + global styles
│   │   │   └── dashboard/
│   │   │       └── page.tsx        ← dashboard route
│   │   ├── components/
│   │   │   ├── LandingPage.tsx     ← hero, features, how it works
│   │   │   └── dashboard/
│   │   │       ├── Dashboard.tsx       ← main shell + tabs
│   │   │       ├── PoliciesTab.tsx     ← policy list + buy modal
│   │   │       ├── FileClaimTab.tsx    ← claim form + score preview
│   │   │       ├── ClaimRow.tsx        ← inline claim + appeal flow
│   │   │       ├── TreasuryTab.tsx     ← treasury + solvency
│   │   │       └── AnalyticsTab.tsx    ← charts + KPIs
│   │   ├── hooks/
│   │   │   └── useClaimBot.ts      ← all data fetching + polling
│   │   ├── services/
│   │   │   ├── api.ts              ← backend REST calls
│   │   │   └── genlayer.ts         ← direct GenLayer SDK (optional)
│   │   └── types/
│   │       └── index.ts            ← shared TypeScript types
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── .env.example
│
├── backend/                  ← Express.js API server
│   ├── src/
│   │   ├── index.js              ← server entry point
│   │   ├── routes/
│   │   │   ├── templates.js      ← GET /api/templates
│   │   │   ├── policies.js       ← GET/POST /api/policies
│   │   │   ├── claims.js         ← GET/POST /api/claims
│   │   │   ├── treasury.js       ← GET /api/treasury
│   │   │   └── stats.js          ← GET /api/stats
│   │   ├── services/
│   │   │   └── genlayer.js       ← on-chain calls + demo mock
│   │   └── db/
│   │       ├── pool.js           ← Postgres connection pool
│   │       └── migrate.js        ← run schema.sql
│   ├── schema.sql                ← Postgres schema (10 tables)
│   ├── package.json
│   ├── Dockerfile
│   └── .env.example
│
└── tests/
    └── test_claimbot.py      ← pytest suite (18 test cases)
```

---

## Available Routes

### Frontend pages
| URL | Description |
|-----|-------------|
| `/` | Landing page |
| `/dashboard` | Full app dashboard |

### Backend API
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/templates` | List policy templates |
| GET | `/api/policies/:wallet` | Wallet's policies |
| POST | `/api/policies/purchase` | Buy a policy |
| POST | `/api/policies/cancel` | Cancel a policy |
| GET | `/api/claims/:wallet` | Wallet's claims |
| GET | `/api/claim/single/:id` | Single claim |
| GET | `/api/claim/single/:id/status` | Poll claim status |
| POST | `/api/claims/submit` | File a claim |
| POST | `/api/claims/appeal` | Appeal a rejection |
| GET | `/api/treasury` | Treasury state |
| GET | `/api/stats` | Global stats |

---

## Demo Mode (default)

With `DEMO_MODE=true` in `backend/.env`:
- No contract deployment needed
- No PostgreSQL needed
- Policy templates are served from in-memory mock data
- Treasury shows realistic demo figures
- Purchases and claims return mock tx hashes
- Ideal for development and UI review

---

## With Real Database

```bash
# Start Postgres (Docker)
docker-compose up postgres -d

# Run migrations
cd backend && npm run db:migrate

# Set in backend/.env:
DEMO_MODE=false
DATABASE_URL=postgresql://claimbot:claimbot_dev@localhost:5432/claimbot
```

For Neon production databases, use the pooled connection string and prefer:

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=verify-full
```

On Render free Docker services, set `RUN_MIGRATIONS=true` to run `backend/schema.sql`
when the container starts.

---

## With Real GenLayer Contract

The deployed Bradbury contract is:

```bash
CONTRACT_ADDRESS=0x5c5C18e0B7bD4EfF63C89C7077DAA64f2F4356d1
GENLAYER_ENDPOINT=https://rpc-bradbury.genlayer.com
```

When `DEMO_MODE=false`, backend writes are signed by `GENLAYER_PRIVATE_KEY`
using the GenLayer JavaScript SDK. Because the contract reads
`gl.message.sender_address`, the backend signer becomes the on-chain policy
holder and claimant for purchases, claims, cancellations, and appeals. Treat
this as a server-signed/custodial flow until browser wallet signing is added.

Render backend environment:

```bash
DEMO_MODE=false
NODE_ENV=production
RUN_MIGRATIONS=false
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=verify-full
GENLAYER_ENDPOINT=https://rpc-bradbury.genlayer.com
CONTRACT_ADDRESS=0x5c5C18e0B7bD4EfF63C89C7077DAA64f2F4356d1
GENLAYER_PRIVATE_KEY=0x...
FRONTEND_URL=https://YOUR-VERCEL-APP.vercel.app
```

Vercel frontend environment:

```bash
NEXT_PUBLIC_API_BASE_URL=https://claimbotapp.onrender.com
NEXT_PUBLIC_CONTRACT_ADDRESS=0x5c5C18e0B7bD4EfF63C89C7077DAA64f2F4356d1
NEXT_PUBLIC_GENLAYER_RPC=https://rpc-bradbury.genlayer.com
```

---

## Run Contract Tests

```bash
pip install pytest pytest-mock
python -m pytest tests/test_claimbot.py -v
```

---

## Full Docker Stack

```bash
docker-compose up --build
```

Starts Postgres + Backend + Frontend together.
Frontend: http://localhost:3000
Backend:  http://localhost:4000

---

## Tech Stack

| Layer | Stack |
|-------|-------|
| Smart contracts | Python (GenLayer requirement) |
| Frontend | Next.js 14, React, TypeScript, Tailwind CSS, Recharts |
| Backend | Node.js, Express, PostgreSQL |
| On-chain | GenLayer SDK (JavaScript) |
| Tests | pytest, pytest-mock |
| Deploy | Docker, GitHub Actions |

---

## Evidence Scoring

| Source type | Points | Example domains |
|-------------|--------|-----------------|
| Government | 35 | nihsa.gov.ng, nimet.gov.ng, ncdc.gov.ng |
| Satellite | 25 | copernicus.eu, earthdata.nasa.gov |
| Weather | 20 | open-meteo.com, wunderground.com |
| News | 20 | channelstv.com, punchng.com, reuters.com |
| Logistics | 25 | flightaware.com, marinetraffic.com |

**Minimum score to trigger LLM evaluation: 70/100**

---

## Grant

Apply at: https://genlayer.foundation/grants
Docs: https://docs.genlayer.com
