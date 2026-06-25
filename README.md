# Pulso — research-grade prediction platform

A Kalshi-style prediction market app for **forecasting research and education**.
Trades are denominated in virtual credits — **not real money, not a security, not gambling**.

This repo ships a working full-stack scaffold:

```
pulso-app/
├── backend/        FastAPI + SQLAlchemy + Postgres + WebSockets
├── frontend/       Next.js 14 (App Router) + Tailwind + TypeScript
├── docker-compose.yml
└── .env.example
```

## What's inside

**Backend (`backend/`, FastAPI)**
- JWT auth (register/login), bcrypt password hashing
- Postgres schema: `users`, `markets`, `orders`, `trades`, `positions`, `activity`
- `/markets` — list & detail with cached current price
- `/orders` — place market or limit orders (YES/NO, BUY/SELL), cancel, list mine
- `/portfolio` — cash, positions (mark-to-market), activity feed
- `/admin/markets` — create new markets (admin only)
- `/admin/markets/{id}/resolve` — settle a market YES or NO; pays out positions
- A lightweight in-process **matching engine** that matches limit orders against the book and executes market orders at best available price (with a configured tick size and complementary YES↔NO matching)
- A **price engine** background task that publishes mid-price updates over a WebSocket (`/ws`) every ~2s — drifting toward order-book consensus with random-walk noise where the book is thin
- Async DB via `asyncpg`/`SQLAlchemy 2.0`

**Frontend (`frontend/`, Next.js 14)**
- App Router, server + client components
- Tailwind with the Kalshi-inspired theme from the prototype (`ink/accent/yes/no` palette, JetBrains Mono for figures)
- API client with token persistence, WebSocket hook for live prices
- Pages: `/` markets list with category & sort, `/markets/[id]` detail with chart & trade panel, `/portfolio`, `/login`, `/register`, `/admin`
- Components: `Header`, `MarketCard`, `LineChart` (custom SVG), `TradePanel` (market + limit tabs)

**Compliance**
- Persistent disclaimer banner on every page
- Footer links for Methodology, Resolution rules, Regional restrictions
- Sign-up requires acknowledgment that this is a research tool, not a brokerage

## Run it locally (Docker)

```bash
cp .env.example .env
docker compose up --build
```

- Frontend: <http://localhost:3000>
- Backend:  <http://localhost:8000>  (Swagger at `/docs`)
- Postgres: `localhost:5432` (user/pass `pulso`/`pulso`, db `pulso`)

The backend seeds an admin user (`admin@pulso.local` / `admin123`) and a dozen sample markets on first boot.

## Run without Docker

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL=postgresql+asyncpg://pulso:pulso@localhost:5432/pulso
export JWT_SECRET=dev-secret-change-me
uvicorn app.main:app --reload

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

## Architecture sketch

```
┌────────────┐  HTTPS   ┌───────────────────────────────────┐
│  Next.js   │ ───────► │  FastAPI                          │
│  (browser) │          │   ├── auth (JWT)                  │
│            │ ◄─── WS──┤   ├── /markets, /orders, /portfolio│
└────────────┘          │   ├── matching engine             │
                        │   ├── price engine (asyncio task) │
                        │   └── ws broadcaster              │
                        │            │                       │
                        │            ▼                       │
                        │      ┌──────────┐                  │
                        │      │ Postgres │                  │
                        │      └──────────┘                  │
                        └───────────────────────────────────┘
```

## What this is NOT

- **Not a real exchange.** No real money flows. No KYC. The matching engine is simplified for didactic purposes.
- **Not a gambling product.** All credit balances are fictional and reset-able. The platform is framed for research and education.
- **Not regulated.** Before deploying anything resembling this in production, you must consult counsel about CFTC, SEC, and state-by-state rules in the U.S., plus equivalent regimes elsewhere.

## Roadmap (suggested next steps)

- [ ] Replace simulated trade-stream with real per-market WS channels
- [ ] Real CLOB matching (price-time priority, partial fills, IOC/FOK)
- [ ] Resolution oracles with multi-source attestation
- [ ] Market-creation review flow with comments
- [ ] Rate limits and per-user request quotas
- [ ] Audit log on all admin actions
- [ ] E2E tests (Playwright) and load tests (Locust)
